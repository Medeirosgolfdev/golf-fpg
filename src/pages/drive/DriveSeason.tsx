/**
 * src/pages/drive/DriveSeason.tsx — a aba «Época» da /drive (AQUAPOR a
 * 02/11/2026; Drive Tour e Challenge logo a seguir, pedido da Mariana: «está
 * muito melhor que as tabelas existentes»): uma linha por jogador e uma coluna
 * por torneio da época — as pancadas de cada volta com o SD por baixo, o lugar
 * e os pontos —, com o campo, a data e a distância de cada torneio no cabeçalho.
 *
 * AQUAPOR (`bySex`): rapazes e raparigas à parte, como o ranking oficial da FPG
 * (RCAH/RCAS) — o lugar e os pontos contam-se dentro do sexo. Drive Tour e
 * Challenge: o lugar é o da prova e o ranking o do escalão aberto (como a
 * classificação acumulada que havia antes); o sexo vai na barra de filtros.
 */
import { useMemo, useState } from "react";
import type { CircuitEntry } from "../../ui/circuit/types";
import type { Sub12Row, TournResult } from "../../ui/driveTypes";
import { SDPill, type PlayersDB } from "../../ui/tournamentPrimitives";
import { RankingTable, type RankingCol } from "../../ui/ranking/RankingPage";
import TabRow from "../../ui/TabRow";
import PlayerLink from "../../ui/PlayerLink";
import TeeSwatch from "../../ui/TeeSwatch";
import TeePill from "../../ui/TeePill";
import EmptyState from "../../ui/EmptyState";
import PosMedal from "../../ui/PosMedal";
import { parsePos, posicoesComEmpates } from "../../utils/classificacao";
import { RowsFilterBar, filterRows, type FilterableRow } from "../../ui/PlayerFilterBar";
import { EMPTY_FILTER } from "../../ui/multiRoundTypes";
import type { PlayerFilter } from "../../data/fpgTypes";
import { getTeeHex } from "../../utils/teeColors";
import { shortCampo } from "../../data/drive/driveCircuitData";
import { AnoEscalaoPill } from "../../ui/AnoEscalaoPill";
import { MUTED } from "../../ui/tableCells";
import { fmtHcp, medal, norm, shortDateSlash } from "../../utils/format";
import { flagOrEmpty, isPtCountry } from "../../utils/flagUtils";
import { ESCALOES_DRIVE } from "../../constants/escaloes";
import type { DriveCalEntry } from "../../data/drive/driveCalendar";
import { EVENTS } from "../../data/calendarEvents";
import SectionTitle from "../../ui/SectionTitle";

type Sex = "M" | "F";

/** Um torneio da época (coluna): da entrada da sidebar, jogado ou por jogar. */
interface Etapa {
  id: string; num: string; campo: string; date: string;
  /** Os torneios da etapa (`tcode_data`): um Challenge tem um por escalão. */
  keys: Set<string>;
  /** Por jogar: os federados inscritos e o estado das inscrições. */
  inscritos?: Set<string>; estado?: string;
}

/** `tcode_data` sem o sufixo da volta (o Resumo traz `_Total`). */
const baseKey = (k: string) => k.replace(/_(R\d+|Total)_/, "_");

/** O campo de uma etapa por jogar que a FPG ainda não pôs nas inscrições: o do
 *  calendário FPG da época (`calendarEvents.ts`, mesmo circuito e dia). */
function campoDoCalendario(calId: string | undefined, date: string): string {
  if (!calId) return "";
  const ev = EVENTS.find(e => e.calId === calId
    && `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}-${String(e.date.getDate()).padStart(2, "0")}` === date);
  return ev ? shortCampo(ev.campo) : "";
}

/** A ordem do nome («3º …»); as Finais ficam «Final». */
const numOf = (name: string) => /\bfinal\b/i.test(name) ? "Final" : name.match(/(\d+)\s*º/)?.[1] ?? "";

function etapas(entries: CircuitEntry[], upcoming: DriveCalEntry[], calId?: string): Etapa[] {
  const jogadas = entries
    .filter(e => e.dateStart)
    .map(e => ({
      id: e.id,
      num: numOf(e.name),
      campo: shortCampo(e.course || e.name.replace(/^.*?-\s*/, "")),
      date: e.dateStart!,
      keys: new Set((e.divisions ?? []).flatMap(d => d.results ? [baseKey(`${d.results.tcode}_${d.results.date}`)] : [])),
    }))
    .filter(e => e.keys.size);
  // As etapas por jogar vêm do calendário da época (as inscrições da FPG).
  const porJogar = upcoming
    .filter(c => !jogadas.some(j => j.date === c.date))
    .map((c, i) => ({
      id: `cal_${c.date}_${i}`, num: numOf(c.name), campo: c.campo || campoDoCalendario(calId, c.date), date: c.date,
      keys: new Set<string>(), inscritos: new Set(c.inscritos ?? []), estado: c.estado,
    }));
  return [...jogadas, ...porJogar].sort((a, b) => a.date.localeCompare(b.date));
}

/** O resultado de um jogador numa etapa. */
const resOf = (r: Sub12Row, e: Etapa) => r.results.find(x => e.keys.has(baseKey(x.tournKey)));

/** O tee e a distância mais jogados numa etapa (pelos jogadores da tabela). */
function teeModal(rows: Sub12Row[], e: Etapa): { tee: string; meters: number } | null {
  const n = new Map<string, number>();
  for (const r of rows) {
    const t = resOf(r, e);
    if (t?.tee && t.meters) n.set(`${t.tee}|${t.meters}`, (n.get(`${t.tee}|${t.meters}`) ?? 0) + 1);
  }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return null;
  const [tee, meters] = top.split("|");
  return { tee, meters: +meters };
}

/** Lugar de cada jogador (federado → lugar) pelos pontos da época; empates
 *  partilham o lugar (`posicoesComEmpates`). Usado aqui e no Ranking da /drive. */
export function rankByPts(rows: Sub12Row[]): Map<string, number> {
  const s = [...rows].sort((a, b) => b.totalPts - a.totalPts);
  const pos = posicoesComEmpates(s, r => r.totalPts);
  return new Map(s.map(r => [r.fed, pos.get(r)!]));
}

const fmtM = (m: number) => m.toLocaleString("pt-PT").replace(/\s/g, " ");

/** O lugar a mostrar: no AQUAPOR o do sexo; no Drive o da prova. */
function lugarOf(r: TournResult, bySex: boolean): number | null {
  if (bySex) return r.sexPos ?? null;
  return parsePos(r.pos); // «T4» → 4; «CUT»/«WD» → sem lugar
}

/** A célula de uma etapa: cada volta (pancadas e, por baixo, o SD), o lugar e os pontos. */
function EtapaCell({ r, modal, bySex }: { r: TournResult | undefined; modal: { tee: string; meters: number } | null; bySex: boolean }) {
  if (!r) return MUTED;
  const rounds = r.rounds?.length ? r.rounds : [r.gross];
  const sds = r.roundSds ?? [];
  const lugar = lugarOf(r, bySex);
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
          : <PosMedal pos={lugar} />}
        {outroTee && <TeeSwatch tee={r.tee!} />}
      </span>
      {rounds.map((_, i) => sds[i] != null
        ? <SDPill key={"s" + i} sd={sds[i]!} hcp={r.hcpExact ?? null} className="aq-sd" title={`SD da ${i + 1}.ª volta`} />
        : <span key={"s" + i} className="aq-sd">{MUTED}</span>)}
      <span className="aq-pts">{r.pts ? r.pts : ""}</span>
    </div>
  );
}

export default function DriveSeason({ title, bySex, pointsNote, calId, rows, allRows, entries, upcoming, pdb, fedBirthdates, initialSex, escLabel }: {
  /** «AQUAPOR 2026», «Drive Challenge Sul 2026». */
  title: string;
  /** AQUAPOR: tabelas por sexo e lugar/pontos dentro do sexo. */
  bySex: boolean;
  /** O que são os pontos (texto do «Pts»). */
  pointsNote: string;
  /** O calendário da página onde procurar o campo de uma etapa por jogar. */
  calId?: string;
  /** As linhas do escalão escolhido. */
  rows: Sub12Row[];
  /** Todas as linhas da época (o lugar no ranking por sexo). */
  allRows: Sub12Row[];
  entries: CircuitEntry[];
  /** O calendário da época (as etapas por jogar entram como colunas). */
  upcoming: DriveCalEntry[];
  pdb: PlayersDB;
  fedBirthdates: Map<string, string>;
  initialSex: Sex;
  escLabel: string;
}) {
  const [sex, setSex] = useState<Sex>(initialSex);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);
  // O universo do ranking: no AQUAPOR todos do sexo; no Drive o escalão aberto.
  const universo = useMemo(() => bySex ? allRows.filter(r => r.sex === sex) : rows, [bySex, allRows, rows, sex]);
  const base = useMemo(() => bySex ? rows.filter(r => r.sex === sex) : rows, [bySex, rows, sex]);
  // Etapas jogadas onde ninguém desta tabela jogou (outro escalão, outra Final) ficam de fora.
  const cols = useMemo(() => etapas(entries, upcoming, calId)
    .filter(c => !c.keys.size || base.some(r => resOf(r, c))), [entries, upcoming, calId, base]);
  // A barra de filtros de jogadores do site (nome/clube, escalão, clube, sexo,
  // ano de nascimento — só o dos juniores, senão eram 40 anos de botões).
  const ano = +(entries[0]?.dateStart?.slice(0, 4) ?? 0);
  const filtraveis = useMemo(() => base.map((r): FilterableRow => {
    const dob = fedBirthdates.get(r.fed);
    return { name: r.name, club: r.club, esc: r.esc, sex: r.sex, fed: r.fed,
      dob: dob && ano - +dob.slice(0, 4) <= 18 ? dob : null };
  }), [base, fedBirthdates, ano]);
  const shown = useMemo(() => {
    const ok = new Set(filterRows(filtraveis, filter).map(x => x.fed));
    return base.filter(r => ok.has(r.fed));
  }, [base, filtraveis, filter]);
  // Lugar no ranking da época: pelos pontos, dentro do universo (empates partilham).
  const rank = useMemo(() => rankByPts(universo), [universo]);
  const modal = useMemo(() => new Map(cols.map(c => [c.id, teeModal(base, c)])), [cols, base]);
  const nM = allRows.filter(r => r.sex === "M").length;
  const nF = allRows.filter(r => r.sex === "F").length;

  const hcp0 = (r: Sub12Row) => r.results.find(x => x.hcpExact != null)?.hcpExact ?? null;
  const evol = (r: Sub12Row) => { const a = hcp0(r); return a != null && r.hcp != null ? r.hcp - a : null; };

  const tableCols: RankingCol<Sub12Row>[] = [
    { key: "rank", label: "#", className: "num", sort: r => r.totalPts > 0 ? rank.get(r.fed) : null, firstDir: "asc",
      cell: r => r.totalPts > 0 ? (medal(rank.get(r.fed)!) ?? <span className="fw-700">{rank.get(r.fed)}</span>) : MUTED },
    { key: "name", label: "Jogador", className: "aq-col-jog", sort: r => norm(r.name), firstDir: "asc",
      cell: r => <>{pdb[r.fed]?.country && !isPtCountry(pdb[r.fed]!.country) ? <span title={pdb[r.fed]!.country ?? ""}>{flagOrEmpty(pdb[r.fed]!.country)} </span> : null}
        <PlayerLink fed={r.fed} name={r.name} className="fw-700" /><div className="c-muted fs-10">{r.club}</div></> },
    { key: "esc", label: "Escalão", sort: r => ESCALOES_DRIVE.indexOf(r.esc ?? "") + 1 || null, firstDir: "asc",
      cell: r => r.esc ? <>{r.esc} {fedBirthdates.get(r.fed) && <AnoEscalaoPill dob={fedBirthdates.get(r.fed)!} escalao={r.esc} />}</> : MUTED },
    { key: "hcp", label: "HCP", title: "HCP actual (e o da 1.ª prova da época)", className: "num", sort: r => r.hcp, firstDir: "asc",
      cell: r => <><span className="fw-600">{fmtHcp(r.hcp)}</span>{hcp0(r) != null && hcp0(r) !== r.hcp && <div className="c-muted fs-10">era {fmtHcp(hcp0(r))}</div>}</> },
    { key: "evol", label: "Evol.", title: "Quanto o HCP mudou desde a 1.ª prova da época (negativo = melhorou)", className: "num", sort: r => evol(r), firstDir: "asc",
      cell: r => { const e = evol(r); return e == null || Math.abs(e) < 0.05 ? MUTED : <span className={"aq-evol " + (e < 0 ? "is-good" : "is-bad")}>{e < 0 ? "▼" : "▲"} {Math.abs(e).toFixed(1)}</span>; } },
    { key: "pts", label: "Pts", title: pointsNote, className: "num", sort: r => r.totalPts, firstDir: "desc",
      tdClassName: "num aq-col-pts", cell: r => r.totalPts ? <span className="fw-800 drive-pts">{r.totalPts}</span> : MUTED },
    ...cols.map((c): RankingCol<Sub12Row> => {
      const m = modal.get(c.id) ?? null;
      const porJogar = !c.keys.size;
      return {
        key: "e" + c.id,
        label: <span className="aq-th">
          <span className="aq-th-num">{c.num ? `${c.num}${c.num === "Final" ? "" : ".º"} · ` : ""}{shortDateSlash(c.date)}</span>
          <span className="aq-th-campo">{c.campo || "—"}</span>
          <span className="aq-th-meta">{m ? <TeePill name={`${fmtM(m.meters)} m`} hex={getTeeHex(m.tee)} />
            : c.inscritos?.size ? <span className="aq-inscritos">{c.inscritos.size} inscritos</span> : porJogar ? "por jogar" : ""}</span>
        </span>,
        title: m ? `Tee mais jogado: ${m.tee}, ${fmtM(m.meters)} m` : c.estado ? `Por jogar · ${c.estado}` : porJogar ? "Ainda não se jogou" : undefined,
        className: "aq-etapa" + (porJogar ? " aq-futuro" : ""),
        sort: r => porJogar ? (c.inscritos?.has(r.fed) ? 0 : 1) : (() => { const x = resOf(r, c); return x ? lugarOf(x, bySex) : null; })(),
        firstDir: "asc",
        cell: r => porJogar
          ? (c.inscritos?.has(r.fed) ? <span className="aq-inscrito">inscrito</span> : MUTED)
          : <EtapaCell r={resOf(r, c)} modal={m} bySex={bySex} />,
      };
    }),
  ];

  return (
    <div className="circuit-ranking aq-season">
      <div className="aq-season-head">
        <div>
          <SectionTitle as="div" size="sm" icon="🏅">{title} — a época</SectionTitle>
          <div className="aq-season-sub">
            {escLabel} · {shown.length} jogadores · {bySex ? "lugar e pontos do ranking oficial (dentro do sexo)" : "lugar na prova e pontos do ranking oficial"} · por baixo de cada volta, o SD
          </div>
        </div>
        {bySex && (
          <TabRow<Sex> ariaLabel="Sexo" active={sex} onChange={s => { setSex(s); setFilter(EMPTY_FILTER); }}
            tabs={[{ key: "M", label: "Masculino", count: nM }, { key: "F", label: "Feminino", count: nF }]} />
        )}
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
