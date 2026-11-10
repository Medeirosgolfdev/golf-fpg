/**
 * src/pages/jogadores/views/ByDateView.tsx
 *
 * Vista "Por data" — todas as rondas do jogador em tabela cronológica
 * ordenável, com scorecard expansível por linha e separadores de ano.
 */
import { useMemo, useState } from "react";
import type { PlayerPageData, RoundData } from "../../../data/playerDataLoader";
import { eclecticForRound } from "../../../data/playerDataLoader";
import { norm } from "../../../utils/format";
import { normKey } from "../../../utils/teeColors";
import { fmtStb } from "../../../utils/scoreDisplay";
import { useSort, compareNullsLast, compareTextNullsLast } from "../../../hooks/useSort";
import ListaTabela, { type ListaColuna } from "../../../ui/ListaTabela";
import { HoleBadge, GrossCell, SdCell } from "../../../ui/tableCells";
import TeePill from "../../../ui/TeePill";
import TeeDate from "../../../ui/TeeDate";
import EmptyState from "../../../ui/EmptyState";
import { ScorecardTable } from "../../../ui/ScorecardTable";
import { CourseLink } from "../../../ui/jogadoresHelpers";
import { EventInfo, effectivePill } from "../../../ui/eventInfo";

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
      let av: number | null, bv: number | null;
      switch (sortKey) {
        case "date": av = a.dateSort; bv = b.dateSort; break;
        case "course": return dir * a.course.localeCompare(b.course, "pt");
        case "event": return compareTextNullsLast(a.eventName, b.eventName, dir);
        case "holes": av = a.holeCount; bv = b.holeCount; break;
        case "hcp": av = a.hi; bv = b.hi; break;
        case "tee": return compareTextNullsLast(a.tee, b.tee, dir);
        case "meters": av = a.meters || null; bv = b.meters || null; break;
        case "gross": av = a.gross; bv = b.gross; break;
        case "stb": av = a.stb; bv = b.stb; break;
        case "sd": av = a.sd; bv = b.sd; break;
        default: av = a.dateSort; bv = b.dateSort;
      }
      return compareNullsLast(av, bv, dir);
    });
    return rounds;
  }, [data, search, sortKey, sortDir]);

  const columns: ListaColuna<RoundData & { course: string }>[] = [
    // scoreId saiu da 2ª linha da célula (duplicava a altura de TODAS as
    // linhas) — vive agora no tooltip da data (aspecto clean, 2026-08-15).
    { key: "date", label: "Data", width: "68px", sortable: true, render: r => (
      <span title={`score #${r.scoreId}`}><TeeDate date={r.date} tee={r.tee || ""} /></span>
    ) },
    // Campo em % (não px): com a tabela estreita, Campo e Prova encolhem juntos
    // em vez de a Prova ficar só com as sobras e partir em 4-5 linhas.
    { key: "course", label: "Campo", width: "17%", sortable: true, render: r => <CourseLink name={r.course} /> },
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
          if (sortKey !== "date") return null; // barras de ano só na ordem por data
          const year = r.date ? r.date.slice(-4) : null;
          const prevYear = prev?.date ? prev.date.slice(-4) : null;
          return (year && prevYear && year !== prevYear) ? <div className="year-label">{year}</div> : null;
        }}
        renderExpanded={r => {
          const holes = data.HOLES[String(r.scoreId)];
          if (!holes) return null;
          const courseKey = norm(r.course);
          const teeKey = r.teeKey || normKey(r.tee || "");
          // O eclético da MESMA metade nas voltas de 9 buracos (10/11/2026, I4).
          const ecEntry = eclecticForRound(data, courseKey, { ...r, teeKey });
          return (
            <div className="scroll-x jg-sc-host">
              <ScorecardTable holes={holes} courseName={r.course} date={r.date} tee={r.tee || ""}
                hi={r.hi} links={r._links} pill={effectivePill(r)} eclecticEntry={ecEntry} grossOficial={r.gross} />
            </div>
          );
        }}
      />
      {all.length === 0 && <EmptyState size="sm" message="Nenhuma ronda encontrada" />}
    </>
  );
}
