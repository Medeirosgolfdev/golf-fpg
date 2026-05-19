/**
 * pages/kids/HistoricScorecardsTab.tsx
 *
 * Tab "Scorecards" do FieldRivaisDashboard. Mostra, para cada edição passada
 * do MESMO torneio (mesmo baseName e escalão), uma sub-tabela com os
 * top-N finishers e as suas pancadas hole-by-hole em cada ronda (R1, R2, R3).
 *
 * Cabeçalho de cada edição inclui par[18] e yards[18] do tee jogado (quando
 * disponível em mh.torneios[tcode].byEscalao[escalao] do member-history-slim).
 * Cores das células via scClass() (eagle/birdie/par/bogey/double/...) do
 * design system existente.
 *
 * Filtro top-N: 5 / 10 / 20 / Todos. Default 10.
 *
 * NOTA: este componente está num ficheiro separado de FieldRivaisDashboard.tsx
 * por uma razão prosaica — o ficheiro pai já tem ~1650 linhas e Edit tools
 * em ficheiros grandes têm-se mostrado pouco fiáveis. Separar mantém ambos
 * editáveis sem risco.
 */
import React, { useMemo, useState } from "react";
import { scClass } from "../../utils/scoreDisplay";

// Mesma estrutura usada em FieldRivaisDashboard / KIDSdataLoader
interface FieldPlayer { nome: string; pais: string; cidade?: string }
interface FieldEscalao { nome: string; jogadores?: FieldPlayer[] }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }

interface MHRound { gross: number; strokes?: number[] }
interface MHTorn { ageGroup: string; place: number | null; rounds: Record<string, MHRound> }
interface MHPlr { name: string; country: string; torneios: Record<string, MHTorn> }
interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }
interface MHSlim {
  torneios: Record<string, {
    name: string;
    startDate: string;
    holesPerRound: number;
    par: number[] | null;
    yards?: number[] | null;
    byEscalao?: Record<string, MHEscalaoMeta>;
  }>;
  jogadores: Record<string, MHPlr>;
}

interface PlayerCard {
  memberId: string;
  name: string;
  country: string;
  officialPlace: number | null;
  total: number;
  rounds: Array<{ rn: number; gross: number; strokes: number[] }>;
}

interface Edition {
  tcode: string;
  name: string;
  year: string;
  course?: string;
  par: number[] | null;
  yards: number[] | null;
  parPerRound: number;
  holesPerRound: number;
  nRoundsMax: number;
  fieldSize: number;
  players: PlayerCard[];
}

const MIN_FIELD_SIZE = 10;
const MIN_GROSS_18H = 55;
const MIN_GROSS_9H = 28;

export default function HistoricScorecardsTab({ mh, torneio, escalaoNome }: {
  mh: MHSlim | null;
  torneio: FieldTorneio | null;
  escalaoNome: string;
}) {
  const [topN, setTopN] = useState<5 | 10 | 20 | 0>(10); // 0 = todos

  const editions: Edition[] | null = useMemo(() => {
    if (!mh || !torneio) return null;
    // Só funciona para tcodes USKids (positivos). Para WJGC/Doral etc (negativos)
    // o slim não tem strokes hole-by-hole; mostramos mensagem mais à frente.
    if (torneio.t < 0) return [];
    const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
    if (!baseName) return [];

    const out: Edition[] = [];
    for (const [tcode, meta] of Object.entries(mh.torneios)) {
      if (!meta?.name) continue;
      if (/Parent\/Child/i.test(meta.name)) continue;
      const mBase = meta.name.replace(/\s+\d{4}\s*$/, "").trim();
      if (mBase !== baseName) continue;
      const yearMatch = meta.name.match(/(\d{4})/);
      if (!yearMatch) continue;
      const year = yearMatch[1];
      const hpr = (meta as any).holesPerRound || 18;
      const minGross = hpr === 9 ? MIN_GROSS_9H : MIN_GROSS_18H;

      // Par + yards específicos do escalão (preferido); senão fallback top-level
      const escMeta = (meta as any).byEscalao?.[escalaoNome] as MHEscalaoMeta | undefined;
      const par = escMeta?.par || (meta as any).par || null;
      const yards = escMeta?.yards || (meta as any).yards || null;
      const parPerRound = Array.isArray(par)
        ? par.slice(0, hpr).reduce((a: number, b: number) => a + (b || 0), 0)
        : 0;

      const players: PlayerCard[] = [];
      let nRoundsMax = 0;
      for (const [mid, p] of Object.entries(mh.jogadores)) {
        const tEntry = p.torneios[tcode];
        if (!tEntry) continue;
        if (tEntry.ageGroup !== escalaoNome) continue;
        const officialPlace = (typeof tEntry.place === "number" && tEntry.place > 0) ? tEntry.place : null;
        const rds: PlayerCard["rounds"] = [];
        let total = 0;
        for (const [rn, r] of Object.entries(tEntry.rounds || {})) {
          if (!r || r.gross <= 0) continue;
          if (r.gross < minGross) continue;
          const strokes = Array.isArray(r.strokes) ? r.strokes.slice() : [];
          rds.push({ rn: parseInt(rn, 10), gross: r.gross, strokes });
          total += r.gross;
        }
        if (rds.length === 0) continue;
        rds.sort((a, b) => a.rn - b.rn);
        if (rds.length > nRoundsMax) nRoundsMax = rds.length;
        players.push({
          memberId: mid,
          name: p.name || "?",
          country: p.country || "",
          officialPlace,
          total,
          rounds: rds,
        });
      }
      // Apenas finishers (completaram todas as rondas)
      const completed = players.filter(pl => pl.rounds.length === nRoundsMax);
      if (completed.length < MIN_FIELD_SIZE) continue;

      // Coverage: descartar edições com field representativo demasiado pequeno
      const placedEntries = completed.filter(e => e.officialPlace != null);
      if (placedEntries.length > 0) {
        const maxOfficialPlace = Math.max(...placedEntries.map(e => e.officialPlace!));
        const coverage = placedEntries.length / maxOfficialPlace;
        if (coverage < 0.8) continue;
      }

      completed.sort((a, b) => {
        const aOff = a.officialPlace ?? Number.POSITIVE_INFINITY;
        const bOff = b.officialPlace ?? Number.POSITIVE_INFINITY;
        if (aOff !== bOff) return aOff - bOff;
        return a.total - b.total;
      });

      out.push({
        tcode, name: meta.name, year,
        course: escMeta?.course,
        par: Array.isArray(par) ? par : null,
        yards: Array.isArray(yards) ? yards : null,
        parPerRound,
        holesPerRound: hpr,
        nRoundsMax,
        fieldSize: completed.length,
        players: completed,
      });
    }
    out.sort((a, b) => b.year.localeCompare(a.year));
    return out;
  }, [mh, torneio, escalaoNome]);

  if (!torneio) {
    return <div className="muted p-16">Sem torneio selecionado.</div>;
  }
  if (editions === null) {
    return <div className="muted p-16">A carregar histórico…</div>;
  }
  if (editions.length === 0) {
    return (
      <div className="muted p-16">
        Sem scorecards hole-by-hole disponíveis para esta combinação. Esta vista
        funciona apenas com edições USKids cobertas pelo member-history-slim
        (≥ {MIN_FIELD_SIZE} finishers, ≥ 80% de cobertura do field oficial).
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar topo: filtro top-N */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10,
        marginBottom: 12, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>
          Pancadas hole-by-hole · {editions.length} edi{editions.length === 1 ? "ção" : "ções"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 12 }}>Top:</span>
        <div style={{
          display: "inline-flex", gap: 2, padding: 2,
          background: "var(--surface-2, var(--bg-secondary, #f1f1ee))",
          borderRadius: 6,
        }}>
          {([5, 10, 20, 0] as const).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setTopN(n)}
              style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px",
                border: "none", borderRadius: 4, cursor: "pointer",
                background: topN === n ? "var(--surface-1, var(--bg-primary, #fff))" : "transparent",
                color: topN === n ? "var(--text)" : "var(--text-3)",
                boxShadow: topN === n ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {n === 0 ? "Todos" : n}
            </button>
          ))}
        </div>
      </div>

      {/* Uma sub-tabela por edição (ano) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {editions.map(ed => (
          <EditionScorecards
            key={ed.tcode}
            edition={ed}
            limit={topN === 0 ? Infinity : topN}
          />
        ))}
      </div>
    </div>
  );
}

function EditionScorecards({ edition, limit }: { edition: Edition; limit: number }) {
  const ed = edition;
  const hpr = ed.holesPerRound;
  const players = ed.players.slice(0, limit);
  // Meta header
  const yardsTotal = ed.yards
    ? ed.yards.slice(0, hpr).reduce((a, b) => a + (b || 0), 0)
    : 0;
  const metersTotal = yardsTotal > 0 ? Math.round(yardsTotal * 0.9144) : null;

  // Headers: PAR row (sempre); YARDS row (se yards existem)
  const showYards = ed.yards && ed.yards.length > 0;
  const showPar = ed.par && ed.par.length > 0;

  const halfA = Math.min(9, hpr); // 1-9
  const halfB = Math.max(0, hpr - halfA); // 10-18 ou 0 em 9H

  const parFront = ed.par ? ed.par.slice(0, halfA).reduce((a, b) => a + (b || 0), 0) : 0;
  const parBack = (ed.par && halfB > 0) ? ed.par.slice(halfA, halfA + halfB).reduce((a, b) => a + (b || 0), 0) : 0;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {/* Header da edição */}
      <div style={{
        padding: "10px 14px",
        background: "var(--bg-muted)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{ed.year}</span>
        {ed.course && (
          <span style={{ fontSize: 13, color: "var(--text-2)", fontStyle: "italic", fontWeight: 500 }}>
            {ed.course}
          </span>
        )}
        {metersTotal != null && (
          <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
            · {metersTotal}m
          </span>
        )}
        {ed.parPerRound > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
            · Par {ed.parPerRound}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
          {ed.nRoundsMax} rondas · field {ed.fieldSize} · top {Math.min(limit, ed.fieldSize)}
        </span>
        {/^\d+$/.test(ed.tcode) && (
          <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${ed.tcode}`}
             target="_blank" rel="noreferrer"
             style={{ fontSize: 11, color: "var(--color-info)", fontWeight: 700, textDecoration: "none" }}>
            ↗
          </a>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="bc-collapse" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", width: "100%" }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "4px 6px", textAlign: "center", minWidth: 28, position: "sticky", left: 0, background: "var(--bg-muted)", zIndex: 2 }}>#</th>
              <th style={{ padding: "4px 6px", textAlign: "left", minWidth: 130, position: "sticky", left: 28, background: "var(--bg-muted)", zIndex: 2 }}>Jogador</th>
              <th style={{ padding: "4px 6px", textAlign: "center", minWidth: 26 }}>R</th>
              {Array.from({ length: hpr }, (_, i) => (
                <th key={i} style={{ padding: "4px 5px", textAlign: "center", fontSize: 10, minWidth: 22 }}>{i + 1}</th>
              ))}
              <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, background: "var(--bg-card, var(--bg))" }}>
                {hpr === 18 ? "OUT" : "Tot"}
              </th>
              {hpr === 18 && (
                <>
                  {Array.from({ length: 0 }).map((_, i) => i)}
                  <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, background: "var(--bg-card, var(--bg))" }}>IN</th>
                  <th style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700 }}>Tot</th>
                </>
              )}
            </tr>
            {/* Linha PAR */}
            {showPar && (
              <tr style={{ background: "var(--bg-card, var(--bg))", color: "var(--text-3)", borderBottom: "1px solid var(--border-light, var(--border))" }}>
                <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: 10, position: "sticky", left: 0, background: "var(--bg-card, var(--bg))" }}>—</td>
                <td style={{ padding: "3px 6px", fontWeight: 600, fontSize: 10, position: "sticky", left: 28, background: "var(--bg-card, var(--bg))" }}>Par</td>
                <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600, fontSize: 10 }}>—</td>
                {ed.par!.slice(0, hpr).map((p, i) => (
                  <td key={i} style={{ padding: "3px 5px", textAlign: "center", fontWeight: 700, fontSize: 10, color: "var(--text-2)" }}>{p}</td>
                ))}
                <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700, fontSize: 11, background: "var(--bg-muted)" }}>
                  {parFront}
                </td>
                {hpr === 18 && (
                  <>
                    <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700, fontSize: 11, background: "var(--bg-muted)" }}>
                      {parBack}
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700, fontSize: 11 }}>
                      {ed.parPerRound}
                    </td>
                  </>
                )}
              </tr>
            )}
            {/* Linha YARDS */}
            {showYards && (
              <tr style={{ background: "var(--bg-card, var(--bg))", color: "var(--text-3)", borderBottom: "1px solid var(--border-light, var(--border))" }}>
                <td style={{ padding: "2px 6px", textAlign: "center", fontSize: 9, position: "sticky", left: 0, background: "var(--bg-card, var(--bg))" }}>—</td>
                <td style={{ padding: "2px 6px", fontSize: 9, fontWeight: 500, position: "sticky", left: 28, background: "var(--bg-card, var(--bg))" }}>Yards</td>
                <td style={{ padding: "2px 6px", textAlign: "center", fontSize: 9 }}>—</td>
                {ed.yards!.slice(0, hpr).map((y, i) => (
                  <td key={i} style={{ padding: "2px 5px", textAlign: "center", fontSize: 9, color: "var(--text-3)" }}>{y || ""}</td>
                ))}
                <td style={{ padding: "2px 6px", textAlign: "center", fontSize: 9, background: "var(--bg-muted)" }} colSpan={hpr === 18 ? 3 : 1}>
                  {ed.yards!.slice(0, hpr).reduce((a, b) => a + (b || 0), 0)}y
                </td>
              </tr>
            )}
          </thead>
          <tbody>
            {players.map((pl, pi) => {
              const displayPos = pl.officialPlace ?? null;
              const medalPos = displayPos ?? 99;
              const medalBg = medalPos === 1 ? "var(--medal-gold-bg)"
                : medalPos === 2 ? "var(--medal-silver-bg)"
                : medalPos === 3 ? "var(--medal-bronze-bg)" : undefined;
              const medalFg = medalPos === 1 ? "var(--medal-gold-fg)"
                : medalPos === 2 ? "var(--medal-silver-fg)"
                : medalPos === 3 ? "var(--medal-bronze-fg)" : "var(--text-2)";
              return pl.rounds.map((r, ri) => {
                const isFirst = ri === 0;
                const strokes = r.strokes && r.strokes.length > 0 ? r.strokes : [];
                const front = strokes.slice(0, Math.min(9, hpr));
                const back = hpr === 18 ? strokes.slice(9, 18) : [];
                const frontSum = front.reduce((a, b) => a + (b || 0), 0);
                const backSum = back.reduce((a, b) => a + (b || 0), 0);
                return (
                  <tr key={pl.memberId + "_r" + r.rn}
                      style={{ borderTop: isFirst ? "2px solid var(--border)" : "1px solid var(--border-light, var(--border))" }}>
                    {/* Pos (rowspan no primeiro round) */}
                    {isFirst && (
                      <td rowSpan={pl.rounds.length}
                          style={{
                            padding: "4px 6px", textAlign: "center", fontWeight: 700,
                            background: medalBg || "var(--bg)", color: medalFg,
                            position: "sticky", left: 0, zIndex: 1, whiteSpace: "nowrap",
                          }}>
                        {displayPos != null ? `#${displayPos}` : `${pi + 1}.`}
                      </td>
                    )}
                    {/* Jogador (rowspan) */}
                    {isFirst && (
                      <td rowSpan={pl.rounds.length}
                          style={{
                            padding: "4px 8px", fontWeight: 600,
                            position: "sticky", left: 28, background: "var(--bg)", zIndex: 1,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            maxWidth: 180,
                          }}>
                        <a href={`/kids2#${encodeURIComponent(pl.name)}`}
                           target="_blank" rel="noreferrer"
                           style={{ color: "var(--text)", textDecoration: "none" }}
                           title={`Abrir ${pl.name} em Kids2`}>
                          {pl.name}
                        </a>
                        {pl.country && (
                          <span style={{ fontSize: 9, color: "var(--text-3)", marginLeft: 4 }}>
                            {pl.country}
                          </span>
                        )}
                      </td>
                    )}
                    {/* Ronda */}
                    <td style={{ padding: "4px 6px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>
                      R{r.rn}
                    </td>
                    {/* Strokes hole-by-hole, com cor scClass */}
                    {Array.from({ length: hpr }, (_, i) => {
                      const g = strokes[i];
                      const p = ed.par ? ed.par[i] : null;
                      if (!g || g <= 0) {
                        return <td key={i} style={{ padding: "2px 4px", textAlign: "center", color: "var(--text-3)" }}>—</td>;
                      }
                      const cls = scClass(g, p ?? null);
                      return (
                        <td key={i} style={{ padding: "2px 3px", textAlign: "center" }}>
                          <span className={"sc-score sc-score-sm " + cls}>{g}</span>
                        </td>
                      );
                    })}
                    {/* OUT */}
                    <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, background: "var(--bg-muted)" }}>
                      {frontSum || "—"}
                    </td>
                    {hpr === 18 && (
                      <>
                        <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700, background: "var(--bg-muted)" }}>
                          {backSum || "—"}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 800 }}>
                          {r.gross}
                        </td>
                      </>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
