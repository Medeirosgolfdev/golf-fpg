/**
 * UskidsDrawTab.tsx — renderer das tabs "Draw R{n}" para torneios USKids.
 *
 * Espelha visualmente o DrawTab da FPG mas sem dependências do mundo FPG
 * (fed code, admissões, escalão por DOB). Os dados vêm de
 * public/data/uskids-draws.json e contêm apenas nome/país/cidade por
 * jogador, mais group_number/tee_time/start_hole por grupo.
 *
 * Colunas: # | 🏁 | Jogador | Cidade | Hora | Buraco
 *
 * Manuel destacado a verde (background bg-success-subtle). Fundos
 * pastel por tee_time para identificar visualmente o flight quando a
 * tabela é reordenada por outra coluna.
 *
 * ⚠ REGRA do projecto: TODAS as colunas do cabeçalho são ordenáveis
 * (useSort + SortableHdr).
 */

import React, { useMemo } from "react";
import { flag } from "../utils/flagUtils";
import { displayName, fmtToPar } from "../utils/format";
import { tpColor } from "./tournamentPrimitives";
import { isManuelByName } from "../constants/manuel";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import type { UskidsDrawRonda, RondaJogador } from "./uskidsTypes";

/** Normaliza nome para matching draw↔leaderboard (lowercase + sem diacríticos
 *  + colapsa espaços + remove pontuação leve). Replica `normName` de
 *  constants/manuel.ts mas exporta-se aqui para o lookup local. */
function normName(s: string): string {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[.\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mesma paleta do DrawTab.tsx (FPG) — manter consistência visual.
const TEE_TIME_PALETTE = [
  "rgba(59, 130, 246, 0.14)",   // azul
  "rgba(34, 197, 94, 0.14)",    // verde
  "rgba(245, 158, 11, 0.14)",   // âmbar
  "rgba(236, 72, 153, 0.14)",   // rosa
  "rgba(168, 85, 247, 0.14)",   // roxo
  "rgba(20, 184, 166, 0.14)",   // teal
];

type SortKey = "pos" | "flag" | "nome" | "cidade" | "hora" | "buraco" | "score" | "topar";

interface Props {
  /** Dados de uma ronda — `{ ronda, grupos: [...] }`. */
  draw: UskidsDrawRonda;
  /** Número da ronda — só para o título. */
  roundNum?: number;
  /** Nome do escalão (e.g. "Boys 12") — só para o título. */
  escalaoNome?: string;
  /** Indicador de que é o escalão do Manuel — usado para o título. */
  isManuelEscalao?: boolean;
  /** Link "↗ resultados oficiais". Optional. */
  externalUrl?: string;
  /** Leaderboard da MESMA ronda — usado para mostrar gross + to_par por jogador
   *  do draw. Matching por nome normalizado. Se não passado, as colunas Score/±
   *  ficam vazias (caso típico para draws de torneios futuros que ainda não
   *  jogaram). */
  roundLeaderboard?: RondaJogador[];
  /** Par total da ronda (soma de RondaResult.par ou RondaResult.total_par).
   *  Usado como fallback para calcular `to_par` quando o leaderboard tem
   *  score mas `to_par: null`. Sem isto, casos edge ficam com "–" mesmo
   *  havendo gross conhecido. */
  roundParTotal?: number | null;
}

export default function UskidsDrawTab({
  draw, roundNum, escalaoNome, isManuelEscalao, externalUrl, roundLeaderboard,
  roundParTotal,
}: Props) {
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos", "asc");

  // Lookup nome → score da ronda (gross + to_par). Matching por nome normalizado.
  // Fallback: se o leaderboard tem score mas to_par null, calcular via roundParTotal.
  const scoreByName = useMemo(() => {
    const m = new Map<string, { score: number; toPar: number | null }>();
    if (!roundLeaderboard) return m;
    for (const j of roundLeaderboard) {
      if (!j.nome) continue;
      const sc = j.score || 0;
      if (sc <= 0) continue;
      let tp: number | null = j.to_par ?? null;
      if (tp == null && roundParTotal && roundParTotal > 0) {
        tp = sc - roundParTotal;
      }
      m.set(normName(j.nome), { score: sc, toPar: tp });
    }
    return m;
  }, [roundLeaderboard, roundParTotal]);

  // Achatar grupos em linhas (uma linha por jogador)
  const flat = useMemo(() => {
    const out: Array<{
      pos: number;
      group_number: number;
      teeTime: string;
      startHole: number;
      course: string;
      nome: string;
      pais: string;
      cidade: string;
      isManuel: boolean;
      score: number | null;
      toPar: number | null;
    }> = [];
    let idx = 0;
    for (const g of draw.grupos || []) {
      for (const p of g.jogadores) {
        idx++;
        const nome = displayName(p.nome || "");
        const lookup = scoreByName.get(normName(p.nome || ""));
        out.push({
          pos: idx,
          group_number: g.group_number,
          teeTime: g.tee_time,
          startHole: g.start_hole,
          course: g.course || "",
          nome,
          pais: (p.pais || "").toUpperCase(),
          cidade: p.cidade || "",
          isManuel: isManuelByName(p.nome),
          score: lookup?.score ?? null,
          toPar: lookup?.toPar ?? null,
        });
      }
    }
    return out;
  }, [draw, scoreByName]);

  // Indicador para esconder colunas Score / ± quando nenhum jogador tem resultado.
  const temAlgumScore = useMemo(() => flat.some(p => p.score != null), [flat]);

  // Ordenação
  const sorted = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    const INF = 9999;
    return [...flat].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":    v = a.pos - b.pos; break;
        case "flag":   v = a.pais.localeCompare(b.pais); break;
        case "nome":   v = a.nome.localeCompare(b.nome, "pt"); break;
        case "cidade": v = a.cidade.localeCompare(b.cidade, "pt"); break;
        case "hora":   v = a.teeTime.localeCompare(b.teeTime); break;
        case "buraco":
          v = a.startHole - b.startHole;
          if (v === 0) v = a.teeTime.localeCompare(b.teeTime);
          break;
        case "score":  v = (a.score ?? INF) - (b.score ?? INF); break;
        case "topar":  v = (a.toPar ?? INF) - (b.toPar ?? INF); break;
      }
      return mult * v;
    });
  }, [flat, sortKey, sortDir]);

  // Cor de fundo por tee_time (cicla paleta pela ordem cronológica)
  const teeTimeBg = useMemo(() => {
    const m = new Map<string, string>();
    const unique = [...new Set(flat.map(p => p.teeTime).filter(Boolean))].sort();
    for (let i = 0; i < unique.length; i++) {
      m.set(unique[i], TEE_TIME_PALETTE[i % TEE_TIME_PALETTE.length]);
    }
    return m;
  }, [flat]);

  // Separador de grupos: linha mais grossa entre flights (só quando sort respeita agrupamento)
  const groupingActive = sortKey === "pos" || sortKey === "hora" || sortKey === "buraco";

  if (!draw.grupos?.length) {
    return (
      <div className="detail-toolbar" style={{ padding: 16 }}>
        <span className="muted">
          Draw ainda não publicado{roundNum ? ` (Ronda ${roundNum})` : ""}.
        </span>
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer"
            className="fs-11 fw-600"
            title="Abre a página oficial do torneio no signupanytime"
            style={{
              color: "var(--accent-text)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              padding: "1px 8px",
              textDecoration: "none",
            }}>
            🏁 signupanytime.com ↗
          </a>
        )}
      </div>
    );
  }

  const totalGrupos = draw.grupos.length;

  return (
    <div>
      {/* Header — título à esquerda, link ↗ ao lado, contadores à direita */}
      <div className="detail-toolbar">
        <span className="fw-700 fs-14">
          {isManuelEscalao ? "★ " : ""}Draw — {escalaoNome ?? `Ronda ${roundNum ?? draw.ronda}`}
          {roundNum && escalaoNome ? ` — Ronda ${roundNum}` : ""}
        </span>
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer"
            className="fs-11 fw-600"
            title="Abre a página oficial do torneio no signupanytime — escolher 'Tee Time' no dropdown lá dentro para ver o draw original"
            style={{
              color: "var(--accent-text)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              padding: "1px 8px",
              textDecoration: "none",
            }}>
            🏁 signupanytime.com ↗
          </a>
        )}
        <span className="muted fs-12 ml-auto">{totalGrupos} flights · {flat.length} jogadores</span>
      </div>

      {/* Tabela */}
      <div className="scroll-x">
        <table className="dtable">
          <thead>
            <tr>
              <SortableHdr k="pos"    sortKey={sortKey} sortDir={sortDir}
                onSort={(k) => toggleSort(k as SortKey)}
                style={{ textAlign: "center", width: 36 }}>#</SortableHdr>
              <SortableHdr k="flag"   sortKey={sortKey} sortDir={sortDir}
                onSort={(k) => toggleSort(k as SortKey)}
                style={{ textAlign: "center", width: 28 }}></SortableHdr>
              <SortableHdr k="nome"   sortKey={sortKey} sortDir={sortDir}
                onSort={(k) => toggleSort(k as SortKey)}>Jogador</SortableHdr>
              <SortableHdr k="cidade" sortKey={sortKey} sortDir={sortDir}
                onSort={(k) => toggleSort(k as SortKey)}>Cidade</SortableHdr>
              <SortableHdr k="hora"   sortKey={sortKey} sortDir={sortDir}
                onSort={(k) => toggleSort(k as SortKey)}
                style={{ textAlign: "center" }}>Hora</SortableHdr>
              <SortableHdr k="buraco" sortKey={sortKey} sortDir={sortDir}
                onSort={(k) => toggleSort(k as SortKey)}
                style={{ textAlign: "center" }}>Buraco</SortableHdr>
              {temAlgumScore && (
                <>
                  <SortableHdr k="topar" sortKey={sortKey} sortDir={sortDir}
                    onSort={(k) => toggleSort(k as SortKey)}
                    style={{ textAlign: "center" }}>±</SortableHdr>
                  <SortableHdr k="score" sortKey={sortKey} sortDir={sortDir}
                    onSort={(k) => toggleSort(k as SortKey)}
                    style={{ textAlign: "center" }}>Resultado</SortableHdr>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const isFirstOfGroup = groupingActive && i > 0 && sorted[i - 1].teeTime !== p.teeTime;
              const borderTop = isFirstOfGroup ? "3px solid var(--text-3)" : undefined;
              const bgRow = p.isManuel ? "var(--bg-success-subtle)" : undefined;
              const baseCell: React.CSSProperties = {
                whiteSpace: "nowrap",
                ...(borderTop ? { borderTop } : {}),
                ...(bgRow ? { background: bgRow } : {}),
              };
              return (
                <tr key={`${p.pos}-${p.nome}`}>
                  <td style={{ ...baseCell, textAlign: "center", fontWeight: 600 }}>{p.pos}</td>
                  <td style={{ ...baseCell, textAlign: "center" }} title={p.pais}>
                    {p.pais ? flag(p.pais) : ""}
                  </td>
                  <td style={{ ...baseCell, padding: "6px 12px", textAlign: "left", fontWeight: p.isManuel ? 700 : 500 }}>
                    {p.isManuel ? "★ " : ""}{p.nome}
                  </td>
                  <td className="muted fs-12" style={{ ...baseCell, textAlign: "left" }}>
                    {p.cidade || "–"}
                  </td>
                  <td className="fs-12 fw-700 mono" style={{
                    ...baseCell, textAlign: "center",
                    background: bgRow || teeTimeBg.get(p.teeTime),
                  }}>
                    {p.teeTime || "–"}
                  </td>
                  <td className="fs-12 fw-600" style={{ ...baseCell, textAlign: "center" }}>
                    T{p.startHole ?? "?"}
                  </td>
                  {temAlgumScore && (
                    <>
                      <td className="fs-12 fw-700 mono" style={{
                        ...baseCell, textAlign: "center",
                        color: p.toPar != null ? tpColor(p.toPar) : undefined,
                      }}>
                        {p.toPar != null ? fmtToPar(p.toPar, "–") : <span className="muted">–</span>}
                      </td>
                      <td className="fs-13 fw-800 mono" style={{ ...baseCell, textAlign: "center" }}>
                        {p.score != null ? p.score : <span className="muted">–</span>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
