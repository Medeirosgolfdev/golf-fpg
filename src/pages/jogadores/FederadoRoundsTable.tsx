/**
 * src/pages/jogadores/FederadoRoundsTable.tsx
 *
 * Tabela rica de rondas WHS live (usada em FederadoOnlyDetail e na vista
 * federado dos Nossos). Replica o estilo da ByDateView com pills, sorting,
 * separadores por ano, etc.
 */
import { useMemo } from "react";
import type { WhsRound } from "../../data/datagolfClient";
import { fmtStb, sdClassByHcp } from "../../utils/scoreDisplay";
import { useSort } from "../../hooks/useSort";
import ListaTabela, { type ListaColuna } from "../../ui/ListaTabela";
import { HoleBadge, GrossCell } from "../../ui/tableCells";
import TeePill from "../../ui/TeePill";
import TeeDate from "../../ui/TeeDate";
import { PillBadge } from "../../ui/PillBadge";
import { CourseLink } from "../../ui/jogadoresHelpers";
import { OriginPill, effectivePill } from "./eventInfo";

/** Info extra de cada ronda extraída do ScoreCard (tee, gross, CR, slope). */
export type RoundExtra = { tee: string; gross: number | null; cr: number | null; slope: number | null };

type FRTSortKey = "date" | "event" | "course" | "holes" | "hcp" | "tee" | "gross" | "stb" | "sd" | "origin" | "par";

export default function FederadoRoundsTable({ rounds, hcpRef, onOpenScorecard, extraMap, localIds }: {
  rounds: WhsRound[];
  hcpRef: number | null;
  onOpenScorecard: (r: WhsRound) => void;
  /** Mapa scoreId → info extra (tee, gross) preenchido async pelo parent */
  extraMap?: Map<number, RoundExtra>;
  /** Set de scoreIds que existem nos nossos dados locais (para comparação) */
  localIds?: Set<number>;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<FRTSortKey>("date", "desc", {
    sd: "asc", hcp: "asc", stb: "desc", holes: "desc", par: "asc", gross: "asc",
  });

  const sorted = useMemo(() => {
    const arr = [...rounds];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va: unknown, vb: unknown;
      switch (sortKey) {
        case "date":   va = a.score_dateStr; vb = b.score_dateStr; break;
        case "event":  va = a.tournament_description; vb = b.tournament_description; break;
        case "course": va = a.course_description; vb = b.course_description; break;
        case "holes":  va = a.hole_count; vb = b.hole_count; break;
        case "hcp":    va = a.calc_hcp_index ?? a.calculated_exact_hcp; vb = b.calc_hcp_index ?? b.calculated_exact_hcp; break;
        case "par":    va = a.par_total; vb = b.par_total; break;
        case "tee":    va = extraMap?.get(a.id)?.tee ?? ""; vb = extraMap?.get(b.id)?.tee ?? ""; break;
        case "gross":  va = extraMap?.get(a.id)?.gross ?? 999; vb = extraMap?.get(b.id)?.gross ?? 999; break;
        case "stb":    va = a.calculated_stablnet_total; vb = b.calculated_stablnet_total; break;
        case "sd":     va = a.score_differential; vb = b.score_differential; break;
        case "origin": va = a.score_origin; vb = b.score_origin; break;
        default:       va = a.score_dateStr; vb = b.score_dateStr;
      }
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
    return arr;
    // extraMap nas deps: o parent preenche-o progressivamente (flush a cada 5
    // scorecards cria um Map novo) — sem isto, ordenar por Tee/Gross durante o
    // batch ficava com a ordem calculada sobre o mapa antigo (tudo 999/"").
  }, [rounds, sortKey, sortDir, extraMap]);

  // Contagem de rondas que NÃO temos em local
  // Ignorar registos administrativos (ajustes de HCP) que têm id=0/null/undefined — não são rondas jogadas
  const missingCount = localIds && localIds.size > 0
    ? rounds.filter(r => r.id && !localIds.has(r.id)).length
    : 0;

  // Colunas SEM larguras fixas → auto-layout (pequenas apertadas, Campo/Prova
  // absorvem o espaço), como a vista federado original. Mesmo conjunto/ordem.
  const columns: ListaColuna<WhsRound>[] = [
    {
      key: "date", label: "Data", width: "68px", sortable: true,
      render: r => {
        const dateStr = (r.score_dateStr || "").slice(0, 10);
        const ddmm = dateStr.split("-").reverse().join("-"); // YYYY-MM-DD → DD-MM-YYYY
        const tee = extraMap?.get(r.id)?.tee || "";
        const isMissing = !!r.id && !!localIds && localIds.size > 0 && !localIds.has(r.id);
        // scoreId no tooltip (não numa 2ª linha — duplicava a altura da linha).
        return (
          <span title={r.id ? `score #${r.id}` : undefined}>
            <TeeDate date={ddmm} tee={tee} />
            {isMissing && <span style={{ marginLeft: 4, color: "var(--color-warn-vivid)", fontSize: "var(--fs-10)" }} title="Não temos esta ronda em local">●</span>}
          </span>
        );
      },
    },
    { key: "course", label: "Campo", width: "150px", sortable: true, render: r => <CourseLink name={r.course_description} /> },
    {
      key: "event", label: "Prova", sortable: true,
      render: r => (
        <>
          <span className="muted">{r.tournament_description}</span>
          <OriginPill origin={r.score_origin} />
          {/* effectivePill partilhado com a ByDateView: INTL (origem INTERN) ou
              REGIONAL/NACIONAL pelo nome da prova. */}
          <PillBadge pill={effectivePill({ scoreOrigin: r.score_origin, eventName: r.tournament_description })} />
        </>
      ),
    },
    { key: "holes", label: "Bur.", width: "44px", align: "right", sortable: true, render: r => <HoleBadge hc={r.hole_count} /> },
    { key: "hcp", label: "HCP", width: "46px", align: "right", sortable: true, render: r => r.calc_hcp_index ?? r.calculated_exact_hcp ?? "" },
    { key: "tee", label: "Tee", width: "92px", sortable: true, render: r => { const e = extraMap?.get(r.id); return e?.tee ? <TeePill name={e.tee} /> : <span className="muted fs-10">…</span>; } },
    { key: "par", label: "Par", width: "44px", align: "right", sortable: true, cellClassName: "muted", render: r => r.par_total ?? "" },
    {
      key: "gross", label: "Gross", width: "64px", align: "right", sortable: true,
      render: r => {
        const e = extraMap?.get(r.id);
        if (e?.gross == null) return <span className="muted fs-10">…</span>;
        return <GrossCell gross={e.gross} par={r.par_total ?? null} />;
      },
    },
    { key: "stb", label: "Stb", width: "44px", align: "right", sortable: true, render: r => fmtStb(r.calculated_stablnet_total, r.hole_count) },
    {
      key: "sd", label: "SD", width: "54px", align: "right", sortable: true,
      render: r => {
        const sdNum = r.score_differential != null ? Number(r.score_differential) : NaN;
        const hiRef = r.calc_hcp_index ?? r.calculated_exact_hcp ?? hcpRef ?? null;
        const sdCls = isFinite(sdNum) && hiRef != null ? sdClassByHcp(sdNum, Number(hiRef)) : "";
        return isFinite(sdNum)
          ? <span className={sdCls ? `p p-${sdCls}` : ""}>{r.score_differential}</span>
          : (r.score_differential ?? "");
      },
    },
    {
      key: "origin", label: "Tipo", width: "96px", sortable: true,
      render: r => {
        const originKey = (r.score_origin || "").trim().toUpperCase();
        if (originKey === "INTERN") return <PillBadge pill="INTL" />;
        if (!originKey || originKey === "TORN") return <span className="muted fs-10">Torneio</span>;
        // EDS / INDIV / TREINO / EXTRA / IMPORT → pill documentado (OriginPill)
        return <OriginPill origin={r.score_origin} />;
      },
    },
  ];

  return (
    <div style={{ maxHeight: 600, overflowY: "auto" }}>
      {localIds && localIds.size > 0 && missingCount > 0 && (
        <div className="p p-sm" style={{ marginBottom: 8, display: "inline-block" }}>
          {missingCount} ronda{missingCount !== 1 ? "s" : ""} na FPG que não temos em local
        </div>
      )}
      <ListaTabela
        noCard
        dense
        columns={columns}
        rows={sorted.slice(0, 200)}
        rowKey={r => `${r.id}-${r.score_dateStr}-${(r.tournament_description || "").slice(0, 12)}`}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort as (k: string) => void}
        onRowClick={r => onOpenScorecard(r)}
        rowClassName={() => "roundRow"}
        separatorBefore={(r, prev) => {
          if (sortKey !== "date") return null;
          const y = (r.score_dateStr || "").slice(0, 4);
          const py = prev ? (prev.score_dateStr || "").slice(0, 4) : null;
          return y && y !== py ? <div className="year-label">{y}</div> : null;
        }}
      />
      {rounds.length > 200 && (
        <div className="muted fs-10 ta-c p-4">A mostrar 200 de {rounds.length} rondas</div>
      )}
    </div>
  );
}
