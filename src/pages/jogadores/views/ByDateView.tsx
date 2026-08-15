/**
 * src/pages/jogadores/views/ByDateView.tsx
 *
 * Vista "Por data" — todas as rondas do jogador em tabela cronológica
 * ordenável, com scorecard expansível por linha e separadores de ano.
 */
import { useMemo, useState } from "react";
import type { PlayerPageData, RoundData } from "../../../data/playerDataLoader";
import { norm } from "../../../utils/format";
import { normKey } from "../../../utils/teeColors";
import { fmtStb } from "../../../utils/scoreDisplay";
import { useSort } from "../../../hooks/useSort";
import ListaTabela, { type ListaColuna } from "../../../ui/ListaTabela";
import { HoleBadge, GrossCell, SdCell } from "../../../ui/tableCells";
import TeePill from "../../../ui/TeePill";
import TeeDate from "../../../ui/TeeDate";
import EmptyState from "../../../ui/EmptyState";
import { ScorecardTable } from "../../../ui/ScorecardTable";
import { CourseLink } from "../../../ui/jogadoresHelpers";
import { EventInfo, effectivePill } from "../eventInfo";
import { scHostStyle } from "../shared";

export default function ByDateView({ data, search }: {
  data: PlayerPageData; search: string;
}) {
  const [openScorecardId, setOpenScorecardId] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<"date" | "course" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd">("date", "desc", {
    gross: "asc", sd: "asc", hcp: "asc", meters: "desc", stb: "desc", holes: "desc",
  });

  const all = useMemo(() => {
    const term = norm(search);
    let rounds: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => {
      c.rounds.forEach(r => {
        rounds.push({ ...r, course: c.course });
      });
    });
    if (term) {
      rounds = rounds.filter(x =>
        norm(x.course).includes(term) || norm(x.eventName || "").includes(term)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    rounds.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "date": av = a.dateSort; bv = b.dateSort; break;
        case "course": return dir * a.course.localeCompare(b.course, "pt");
        case "event": return dir * (a.eventName || "").localeCompare(b.eventName || "", "pt");
        case "holes": av = a.holeCount; bv = b.holeCount; break;
        case "hcp": av = a.hi ?? 999; bv = b.hi ?? 999; break;
        case "tee": return dir * (a.tee || "").localeCompare(b.tee || "");
        case "meters": av = a.meters ?? 0; bv = b.meters ?? 0; break;
        case "gross": av = a.gross ?? 999; bv = b.gross ?? 999; break;
        case "stb": av = a.stb ?? -999; bv = b.stb ?? -999; break;
        case "sd": av = a.sd ?? 999; bv = b.sd ?? 999; break;
        default: av = a.dateSort; bv = b.dateSort;
      }
      return dir * (av - bv);
    });
    return rounds;
  }, [data, search, sortKey, sortDir]);

  const columns: ListaColuna<RoundData & { course: string }>[] = [
    // scoreId saiu da 2ª linha da célula (duplicava a altura de TODAS as
    // linhas) — vive agora no tooltip da data (aspecto clean, 2026-08-15).
    { key: "date", label: "Data", width: "68px", sortable: true, render: r => (
      <span title={`score #${r.scoreId}`}><TeeDate date={r.date} tee={r.tee || ""} /></span>
    ) },
    { key: "course", label: "Campo", width: "190px", sortable: true, render: r => <CourseLink name={r.course} /> },
    { key: "event", label: "Prova", sortable: true, cellClassName: "col-prova", render: r => (
      <EventInfo name={r.eventName} origin={r.scoreOrigin} pill={effectivePill(r)} links={r._links}
        fed={data.CURRENT_FED} tcode={r.tcode} ccode={r.ccode} course={r.course} />
    ) },
    { key: "holes", label: "Bur.", width: "44px", align: "right", sortable: true, render: r => <HoleBadge hc={r.holeCount} /> },
    { key: "hcp", label: "HCP", width: "46px", align: "right", sortable: true, render: r => r.hi ?? "" },
    { key: "tee", label: "Tee", width: "92px", sortable: true, render: r => <TeePill name={r.tee || ""} /> },
    { key: "meters", label: "Dist.", width: "60px", align: "right", cellClassName: "muted", sortable: true, render: r => r.meters ? `${r.meters}m` : "" },
    { key: "gross", label: "Gross", width: "64px", align: "right", sortable: true, render: r => <GrossCell gross={r.gross} par={r.par} /> },
    { key: "stb", label: "Stb", width: "44px", align: "right", sortable: true, render: r => fmtStb(r.stb, r.holeCount) },
    { key: "sd", label: "SD", width: "54px", align: "right", sortable: true, render: r => <SdCell round={r} /> },
  ];

  return (
    <>
      <ListaTabela
        dense
        columns={columns}
        rows={all}
        rowKey={r => r.scoreId}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort as (k: string) => void}
        expandedKey={openScorecardId}
        onRowClick={r => { if (r.hasCard) setOpenScorecardId(openScorecardId === r.scoreId ? null : r.scoreId); }}
        rowClassName={(_r, open) => `roundRow${open ? " pa-row-open" : ""}`}
        separatorBefore={(r, prev) => {
          const year = r.date ? r.date.slice(-4) : null;
          const prevYear = prev?.date ? prev.date.slice(-4) : null;
          return (year && prevYear && year !== prevYear) ? <div className="year-label">{year}</div> : null;
        }}
        renderExpanded={r => {
          const holes = data.HOLES[String(r.scoreId)];
          if (!holes) return null;
          const courseKey = norm(r.course);
          const teeKey = r.teeKey || normKey(r.tee || "");
          const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;
          return (
            <div className="scroll-x" style={scHostStyle}>
              <ScorecardTable holes={holes} courseName={r.course} date={r.date} tee={r.tee || ""}
                hi={r.hi} links={r._links} pill={effectivePill(r)} eclecticEntry={ecEntry} />
            </div>
          );
        }}
      />
      {all.length === 0 && <EmptyState size="sm" message="Nenhuma ronda encontrada" />}
    </>
  );
}
