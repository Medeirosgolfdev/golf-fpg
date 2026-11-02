/**
 * src/pages/drive/AquaporSeason.tsx — a aba «Época» do AQUAPOR (02/11/2026,
 * pedido da Mariana): uma linha por jogador e uma coluna por torneio da época —
 * as pancadas de cada volta e o lugar —, com o campo, a data e a distância de
 * cada torneio no cabeçalho. Rapazes e raparigas à parte, como o ranking
 * oficial da FPG (RCAH/RCAS): o lugar e os pontos contam-se dentro do sexo.
 */
import { useMemo, useState } from "react";
import type { CircuitEntry } from "../../ui/circuit/types";
import type { Sub12Row, TournResult } from "../../ui/driveTypes";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { RankingTable, type RankingCol } from "../../ui/ranking/RankingPage";
import TabRow from "../../ui/TabRow";
import PlayerLink from "../../ui/PlayerLink";
import TeeSwatch from "../../ui/TeeSwatch";
import TeePill from "../../ui/TeePill";
import EmptyState from "../../ui/EmptyState";
import { medalClass } from "../../ui/PosBadge";
import { RowsFilterBar, filterRows, type FilterableRow } from "../../ui/PlayerFilterBar";
import { EMPTY_FILTER } from "../../ui/multiRoundTypes";
import type { PlayerFilter } from "../../data/fpgTypes";
import { getTeeHex } from "../../utils/teeColors";
import { shortCampo } from "../../data/drive/driveCircuitData";
import { AnoEscalaoPill } from "../../ui/AnoEscalaoPill";
import { MUTED } from "../../ui/tableCells";
import { fmtHcp, medal, norm, shortDateSlash } from "../../utils/format";
import { sdClassByHcp } from "../../utils/scoreDisplay";
import { flagOrEmpty, isPtCountry } from "../../utils/flagUtils";
import { ESCALOES_DRIVE } from "../../constants/escaloes";
import type { DriveCalEntry } from "../../data/drive/driveCalendar";
import { EVENTS } from "../../data/calendarEvents";

type Sex = "M" | "F";

/** Um torneio da época (coluna): da entrada da sidebar, jogado ou por jogar. */
interface Etapa {
  key: string; num: string; campo: string; date: string;
  /** Por jogar: os federados inscritos e o estado das inscrições. */
  inscritos?: Set<string>; estado?: string;
}

/** O campo de uma etapa por jogar que a FPG ainda não pôs nas inscrições: o do
 *  calendário FPG da época (`calendarEvents.ts`, circuito AQUAPOR, mesmo dia). */
function campoDoCalendario(date: string): string {
  const ev = EVENTS.find(e => e.calId === "fpg_aquapor"
    && `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}-${String(e.date.getDate()).padStart(2, "0")}` === date);
  return ev ? shortCampo(ev.campo) : "";
}

function etapas(entries: CircuitEntry[], upcoming: DriveCalEntry[]): Etapa[] {
  const jogadas = entries
    .filter(e => e.tcode && e.dateStart)
    .map(e => ({
      key: `${e.tcode}_${e.dateStart}`,
      num: e.name.match(/(\d+)\s*º/)?.[1] ?? "",
      campo: shortCampo(e.course || e.name.replace(/^.*?-\s*/, "")),
      date: e.dateStart!,
    }));
  // As etapas por jogar vêm do calendário da época (as inscrições da FPG).
  const porJogar = upcoming
    .filter(c => !jogadas.some(j => j.date === c.date))
    .map(c => ({
      key: `cal_${c.date}`, num: c.name.match(/(\d+)\s*º/)?.[1] ?? "", campo: c.campo || campoDoCalendario(c.date), date: c.date,
      inscritos: new Set(c.inscritos ?? []), estado: c.estado,
    }));
  return [...jogadas, ...porJogar].sort((a, b) => a.date.localeCompare(b.date));
}

/** O resultado de um jogador numa etapa (o Resumo traz `_Total` no tcode). */
const resOf = (r: Sub12Row, key: string) => r.results.find(x => x.tournKey.replace(/_(R\d+|Total)_/, "_") === key);

/** O tee e a distância mais jogados numa etapa (por sexo). */
function teeModal(rows: Sub12Row[], key: string): { tee: string; meters: number } | null {
  const n = new Map<string, number>();
  for (const r of rows) {
    const t = resOf(r, key);
    if (t?.tee && t.meters) n.set(`${t.tee}|${t.meters}`, (n.get(`${t.tee}|${t.meters}`) ?? 0) + 1);
  }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return null;
  const [tee, meters] = top.split("|");
  return { tee, meters: +meters };
}

const fmtM = (m: number) => m.toLocaleString("pt-PT").replace(/\s/g, " ");

/** A célula de uma etapa: cada volta (pancadas e, por baixo, o SD) e o lugar no sexo. */
function EtapaCell({ r, modal }: { r: TournResult | undefined; modal: { tee: string; meters: number } | null }) {
  if (!r) return MUTED;
  const rounds = r.rounds?.length ? r.rounds : [r.gross];
  const sds = r.roundSds ?? [];
  const outroTee = r.tee && modal && r.tee !== modal.tee;
  const title = [r.tee && `Tee ${r.tee}${r.meters ? ` · ${fmtM(r.meters)} m` : ""}`,
    !r.wd && `Total ${r.gross} (${r.toPar > 0 ? "+" : ""}${r.toPar === 0 ? "E" : r.toPar})`].filter(Boolean).join("\n");
  // Grelha de 2 linhas (para a linha da tabela não engordar): em cima as
  // pancadas de cada volta e o lugar; em baixo o SD de cada volta e os pontos.
  return (
    <div className={"aq-cell aq-cell-" + Math.min(rounds.length, 4)} title={title}>
      {rounds.map((g, i) => <span key={"g" + i} className="aq-volta" title={`${i + 1}.ª volta`}>{g}</span>)}
      <span className="aq-lugar">
        {r.wd ? <span className="aq-wd">desistiu</span>
          : r.sexPos != null ? <span className={"pos-medal pos-medal-sm " + medalClass(r.sexPos)}>{r.sexPos}.º</span> : MUTED}
        {outroTee && <TeeSwatch tee={r.tee!} />}
      </span>
      {rounds.map((_, i) => sds[i] != null
        ? <span key={"s" + i} className={"p p-sm aq-sd p-" + sdClassByHcp(sds[i]!, r.hcpExact ?? null)} title={`SD da ${i + 1}.ª volta`}>{sds[i]!.toFixed(1)}</span>
        : <span key={"s" + i} className="aq-sd">{MUTED}</span>)}
      <span className="aq-pts">{r.pts ? r.pts : ""}</span>
    </div>
  );
}

export default function AquaporSeason({ rows, allRows, entries, upcoming, pdb, fedBirthdates, initialSex, escLabel }: {
  /** As linhas do escalão escolhido. */
  rows: Sub12Row[];
  /** Todas as linhas da época (o lugar no ranking e o tee de cada etapa). */
  allRows: Sub12Row[];
  entries: CircuitEntry[];
  /** O calendário da época (as etapas por jogar entram como colunas vazias). */
  upcoming: DriveCalEntry[];
  pdb: PlayersDB;
  fedBirthdates: Map<string, string>;
  initialSex: Sex;
  escLabel: string;
}) {
  const [sex, setSex] = useState<Sex>(initialSex);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);
  const cols = useMemo(() => etapas(entries, upcoming), [entries, upcoming]);
  const allSex = useMemo(() => allRows.filter(r => r.sex === sex), [allRows, sex]);
  const doSexo = useMemo(() => rows.filter(r => r.sex === sex), [rows, sex]);
  // A barra de filtros de jogadores do site (nome/clube, escalão, clube, ano de
  // nascimento — só o dos juniores, senão eram 40 anos de botões).
  const ano = +(entries[0]?.dateStart?.slice(0, 4) ?? 0);
  const filtraveis = useMemo(() => doSexo.map((r): FilterableRow => {
    const dob = fedBirthdates.get(r.fed);
    return { name: r.name, club: r.club, esc: r.esc, sex: r.sex, fed: r.fed,
      dob: dob && ano - +dob.slice(0, 4) <= 18 ? dob : null };
  }), [doSexo, fedBirthdates, ano]);
  const shown = useMemo(() => {
    const ok = new Set(filterRows(filtraveis, filter).map(x => x.fed));
    return doSexo.filter(r => ok.has(r.fed));
  }, [doSexo, filtraveis, filter]);
  // Lugar no ranking da época: pelos pontos, entre TODOS do sexo (empates partilham).
  const rank = useMemo(() => {
    const s = [...allSex].sort((a, b) => b.totalPts - a.totalPts);
    const m = new Map<string, number>();
    s.forEach((r, i) => m.set(r.fed, i > 0 && s[i - 1].totalPts === r.totalPts ? m.get(s[i - 1].fed)! : i + 1));
    return m;
  }, [allSex]);
  const modal = useMemo(() => new Map(cols.map(c => [c.key, teeModal(allSex, c.key)])), [cols, allSex]);
  const nM = allRows.filter(r => r.sex === "M").length;
  const nF = allRows.filter(r => r.sex === "F").length;

  const hcp0 = (r: Sub12Row) => r.results.find(x => x.hcpExact != null)?.hcpExact ?? null;
  const evol = (r: Sub12Row) => { const a = hcp0(r); return a != null && r.hcp != null ? r.hcp - a : null; };

  const tableCols: RankingCol<Sub12Row>[] = [
    { key: "rank", label: "#", className: "num", sort: r => r.totalPts > 0 ? rank.get(r.fed) ?? 9999 : 9999, firstDir: "asc",
      cell: r => r.totalPts > 0 ? (medal(rank.get(r.fed)!) ?? <span className="fw-700">{rank.get(r.fed)}</span>) : MUTED },
    { key: "name", label: "Jogador", className: "aq-col-jog", sort: r => norm(r.name), firstDir: "asc",
      cell: r => <>{pdb[r.fed]?.country && !isPtCountry(pdb[r.fed]!.country) ? <span title={pdb[r.fed]!.country ?? ""}>{flagOrEmpty(pdb[r.fed]!.country)} </span> : null}
        <PlayerLink fed={r.fed} name={r.name} className="fw-700" /><div className="c-muted fs-10">{r.club}</div></> },
    { key: "esc", label: "Escalão", sort: r => ESCALOES_DRIVE.indexOf(r.esc ?? "") + 1 || 99, firstDir: "asc",
      cell: r => r.esc ? <>{r.esc} {fedBirthdates.get(r.fed) && <AnoEscalaoPill dob={fedBirthdates.get(r.fed)!} escalao={r.esc} />}</> : MUTED },
    { key: "hcp", label: "HCP", title: "HCP actual (e o da 1.ª prova da época)", className: "num", sort: r => r.hcp ?? 99, firstDir: "asc",
      cell: r => <><span className="fw-600">{fmtHcp(r.hcp)}</span>{hcp0(r) != null && hcp0(r) !== r.hcp && <div className="c-muted fs-10">era {fmtHcp(hcp0(r))}</div>}</> },
    { key: "evol", label: "Evol.", title: "Quanto o HCP mudou desde a 1.ª prova da época (negativo = melhorou)", className: "num", sort: r => evol(r) ?? 99, firstDir: "asc",
      cell: r => { const e = evol(r); return e == null || Math.abs(e) < 0.05 ? MUTED : <span className={"aq-evol " + (e < 0 ? "is-good" : "is-bad")}>{e < 0 ? "▼" : "▲"} {Math.abs(e).toFixed(1)}</span>; } },
    { key: "pts", label: "Pts", title: "Pontos do ranking oficial (lugar dentro do sexo; empates partilham os pontos)", className: "num", sort: r => r.totalPts, firstDir: "desc",
      tdClassName: "num aq-col-pts", cell: r => r.totalPts ? <span className="fw-800 drive-pts">{r.totalPts}</span> : MUTED },
    ...cols.map((c): RankingCol<Sub12Row> => {
      const m = modal.get(c.key) ?? null;
      return {
        key: "e" + c.key,
        label: <span className="aq-th">
          <span className="aq-th-num">{c.num ? `${c.num}.º · ` : ""}{shortDateSlash(c.date)}</span>
          <span className="aq-th-campo">{c.campo || "—"}</span>
          <span className="aq-th-meta">{m ? <TeePill name={`${fmtM(m.meters)} m`} hex={getTeeHex(m.tee)} />
            : c.inscritos?.size ? <span className="aq-inscritos">{c.inscritos.size} inscritos</span> : "por jogar"}</span>
        </span>,
        title: m ? `Tee mais jogado: ${m.tee}, ${fmtM(m.meters)} m` : c.estado ? `Por jogar · ${c.estado}` : "Ainda não se jogou",
        className: "aq-etapa" + (m ? "" : " aq-futuro"),
        sort: r => c.inscritos ? (c.inscritos.has(r.fed) ? 0 : 1) : resOf(r, c.key)?.sexPos ?? (resOf(r, c.key) ? 998 : 999),
        firstDir: "asc",
        cell: r => c.inscritos
          ? (c.inscritos.has(r.fed) ? <span className="aq-inscrito">inscrito</span> : MUTED)
          : <EtapaCell r={resOf(r, c.key)} modal={m} />,
      };
    }),
  ];

  return (
    <div className="circuit-ranking aq-season">
      <div className="aq-season-head">
        <div>
          <div className="h-sm">🏅 AQUAPOR {cols[0]?.date.slice(0, 4)} — a época</div>
          <div className="aq-season-sub">
            {escLabel} · {shown.length} jogadores · lugar e pontos do ranking oficial (dentro do sexo) · por baixo de cada volta, o SD
          </div>
        </div>
        <TabRow<Sex> ariaLabel="Sexo" active={sex} onChange={s => { setSex(s); setFilter(EMPTY_FILTER); }}
          tabs={[{ key: "M", label: "Masculino", count: nM }, { key: "F", label: "Feminino", count: nF }]} />
      </div>
      {/* Sem playersDB: o ano de nascimento é só o que vai na linha (os juniores). */}
      <RowsFilterBar rows={filtraveis} filter={filter} onChange={setFilter} total={filtraveis.length} />
      {shown.length === 0
        ? <EmptyState icon="🏅" message="Nenhum jogador com estes filtros." />
        : <RankingTable rows={shown} cols={tableCols} rowKey={r => r.fed} defaultSort="rank" defaultDir="asc"
            tieBreak={(a, b) => a.name.localeCompare(b.name, "pt")} />}
    </div>
  );
}
