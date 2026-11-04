/**
 * TeamStrokeStandings — classificação de EQUIPAS em stroke play, peça
 * partilhada (fase 6 do plano, 23/10/2026). Substitui o ClubesGruposView, o
 * ClubesCategoriasView e o DriveEquipasTab; os dados vêm de
 * `src/data/teamStroke.ts` (as mesmas contas que essas vistas faziam).
 *
 * Três vistas:
 *   • Cartões  — um cartão por equipa (o aspecto das vistas de clubes);
 *   • Lista    — uma linha por equipa, que se abre nos jogadores;
 *   • Jogadores — todos os jogadores numa tabela (filtro por equipa).
 * Numa só categoria, «Grupo · R1 · R2 · Total» escolhe a volta (e os 🐦○■).
 * Tudo ordenável. A de pontos (match play) continua na TeamPointsStandings.
 */
import React, { useMemo, useState } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import { EscPill } from "../PillBadge";
import { medal, fmtToPar } from "../../utils/format";
import { isManuelByName, MANUEL_FED } from "../../constants/manuel";
import type { TsModel, TsTeam, TsCat, TsPlayer, Bpb } from "../../data/teamStroke";
import TabRow from "../TabRow";
import ExpandArrow from "../ExpandArrow";
import PlayerLink from "../PlayerLink";
import { MUTED } from "../tableCells";
import Select from "../Select";
import SectionTitle from "../SectionTitle";
import { Tint } from "../DataStyle";

type View = "cartoes" | "lista" | "jogadores";
/** Volta escolhida (uma categoria): grupo = ordem das letras + 🐦○■ de todas as voltas. */
type RoundSel = "grupo" | "total" | number;

// Letra, cabeçalho, linhas e separadores vêm da .dtable (modelo único das tabelas).

const tpTxt = (tp: number | null | undefined) => fmtToPar(tp, "");
const isEu = (p: TsPlayer) => (p.fed ? p.fed === MANUEL_FED : isManuelByName(p.name));
const sumBpb = (xs: (Bpb | null)[]): Bpb | null => {
  const ok = xs.filter((x): x is Bpb => !!x);
  return ok.length ? ok.reduce((a, b) => ({ bir: a.bir + b.bir, par: a.par + b.par, bog: a.bog + b.bog }), { bir: 0, par: 0, bog: 0 }) : null;
};

/** Valor da equipa que ordena e classifica (pancadas ou ±par). */
function teamVal(c: TsCat, model: TsModel, ri: number | null): number | null {
  if (ri != null) return model.rankBy === "toPar" ? c.rdToPar[ri] : c.rdTotals[ri];
  return model.rankBy === "toPar" ? c.toPar : c.total;
}

/* ── Nome do jogador (link à ficha FPG quando há) ── */
function PName({ p }: { p: TsPlayer }) {
  const txt = p.link && p.fed
    ? <PlayerLink fed={p.fed} name={p.name} />
    : <>{p.name}</>;
  if (!p.esc) return txt;
  return (
    <span className="u-d-grid u-grid-template-columns-94px-1fr u-ai-center u-column-gap-6px">
      <span className="u-ws-nowrap"><EscPill esc={p.esc} /></span>
      <span className="u-ov-hidden u-tov-ellipsis u-ws-nowrap">{txt}</span>
    </span>
  );
}

/* ── Gross (±par) de uma volta; os que contam a cheio, na cor da equipa ── */
function ScoreCell({ r, color }: { r: TsPlayer["rds"][number]; color: string }) {
  if (r.gross == null && r.toPar == null) return <td className="u-ta-center u-c-text-muted">{MUTED}</td>;
  return (
    <Tint as="td" className={"ts-score " + (r.counts ? "u-fw-700" : "u-fw-400 u-c-text")} fg={r.counts ? color : null}>
      <div className="u-lh-1_2">
        <div>{r.gross ?? "—"}</div>
        {r.toPar != null && (
          <Tint as="div" className={"ts-score-tp" + (r.counts ? " counts" : "")} fg={r.counts ? color : null}>
            ({fmtToPar(r.toPar)})
          </Tint>
        )}
      </div>
    </Tint>
  );
}

type PKey = "nome" | "hcp" | "bur" | "tot" | "conta" | `r${number}`;

/** Jogadores de uma equipa (ou categoria): a mesma tabela nos cartões e na lista. */
function PlayersTable({ cat, model, color, cols, bpbMode, showTotal }: {
  cat: TsCat; model: TsModel; color: string;
  /** Índices das voltas visíveis. */
  cols: number[];
  /** 🐦○■ de uma volta (índice) ou de todas («all»). */
  bpbMode: number | "all" | null;
  showTotal: boolean;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<PKey>(model.playerSort ?? (model.showConta ? "r0" : "nome"), "asc");
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    const v = (p: TsPlayer): number | string => {
      if (sortKey === "nome") return p.name;
      if (sortKey === "hcp") return p.hcpSort ?? 999;
      if (sortKey === "bur") return p.holes ?? INF;
      if (sortKey === "tot") return p.total ?? INF;
      if (sortKey === "conta") return p.conta ? 0 : 1;
      const ri = parseInt(sortKey.slice(1), 10);
      const r = p.rds[ri];
      return (model.rankBy === "toPar" ? r?.toPar : r?.gross) ?? INF;
    };
    return [...cat.players].sort((a, b) => {
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * av.localeCompare(bv as string, "pt");
      return dir * ((av as number) - (bv as number));
    });
  }, [cat.players, sortKey, sortDir, model.rankBy]);
  const hdr = (k: PKey, label: React.ReactNode, cls?: string, title?: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title={title} className={"u-cur-pointer" + (cls ? " " + cls : "")}>{label}</SortableHdr>
  );
  const bpbOf = (p: TsPlayer) => (bpbMode === "all" ? sumBpb(p.rds.map(r => r.bpb)) : bpbMode != null ? p.rds[bpbMode]?.bpb ?? null : null);
  const footBpb = bpbMode != null ? sumBpb(cat.players.map(bpbOf)) : null;
  const withFooter = model.rankBy !== "toPar";
  return (
    <table className="dtable ts-table">
      <thead>
        <tr>
          {hdr("nome", "Jogador", "ts-name")}
          {model.showHcp && hdr("hcp", "HCP")}
          {model.showHoles && hdr("bur", "Bur.", undefined, "Sub-10 joga 9 buracos")}
          {cols.map(ri => hdr(`r${ri}`, model.rankBy === "toPar" ? "Gross" : `R${model.rounds[ri]}`))}
          {bpbMode != null ? (<>
            <th className="ts-bpb-b">🐦</th>
            <th className="ts-bpb-p">○</th>
            <th className="ts-bpb-g">■</th>
          </>) : showTotal && hdr("tot", "Tot.")}
          {model.showConta && hdr("conta", "Conta", undefined, "Entra no total da equipa")}
        </tr>
      </thead>
      <tbody>
        {rows.map(p => {
          const b = bpbOf(p);
          return (
            <tr key={p.key} className={isEu(p) ? "row-manuel" : undefined}>
              <td className={"ts-name ts-name-cell" + (p.hasScore ? "" : " no-score")}>
                <PName p={p} />
              </td>
              {model.showHcp && <td className={"u-c-text-muted" + (p.hasScore || model.multiCat ? "" : " u-op-0_55")}>{p.hcp}</td>}
              {model.showHoles && <td>{p.holes ?? "–"}</td>}
              {cols.map(ri => <ScoreCell key={ri} r={p.rds[ri]} color={color} />)}
              {bpbMode != null ? (<>
                <td className="ts-bpb-b u-fw-600">{b ? (b.bir || "") : "–"}</td>
                <td className="ts-bpb-p">{b ? (b.par || "") : "–"}</td>
                <td className="ts-bpb-g">{b ? (b.bog || "") : "–"}</td>
              </>) : showTotal && <td className={"u-fw-500 " + (p.hasScore ? "u-c-text" : "u-c-text-muted")}>{p.total ?? "–"}</td>}
              {model.showConta && <td>{p.conta ? "✓" : ""}</td>}
            </tr>
          );
        })}
      </tbody>
      {withFooter && (
        <tfoot>
          <Tint as="tr" className={"ts-foot" + (model.footerAll ? " all" : "")} bg={model.footerAll ? color : null}>
            <td colSpan={1 + (model.showHcp ? 1 : 0) + (model.showHoles ? 1 : 0)} className="ts-foot-lbl">
              {cat.footerLabel}
            </td>
            {cols.map(ri => {
              // Uma categoria: soma de todos os jogadores; com categorias: o total da equipa (best-N).
              const v = model.footerAll ? cat.rdSumsAll[ri] : cat.rdTotals[ri];
              return <td key={ri}>{v ?? "–"}</td>;
            })}
            {bpbMode != null ? (<>
              <td className="ts-bpb-b">{footBpb ? (footBpb.bir || "") : "–"}</td>
              <td className="ts-bpb-p">{footBpb ? (footBpb.par || "") : "–"}</td>
              <td className="ts-bpb-g">{footBpb ? (footBpb.bog || "") : "–"}</td>
            </>) : showTotal && (
              model.footerAll ? (() => {
                const vs = cols.map(ri => cat.rdSumsAll[ri]);
                const grand = vs.every(v => v != null) ? (vs as number[]).reduce((s, v) => s + v, 0) : null;
                return <td className="ts-grand-all">{grand ?? "–"}</td>;
              })() : (
                <td className="ts-grand">
                  <div className="u-lh-1_15">
                    <div>{cat.total ?? "–"}</div>
                    {cat.toPar != null && <div className="u-fs-fs-9 u-lh-1 u-op-0_7">({fmtToPar(cat.toPar)})</div>}
                  </div>
                </td>
              )
            )}
            {model.showConta && <td />}
          </Tint>
        </tfoot>
      )}
    </table>
  );
}

/* ── Cartões ─────────────────────────────────────────────────────── */
function TeamCard({ team, model, sel }: { team: TsTeam; model: TsModel; sel: RoundSel }) {
  const c0 = team.cats[0];
  const ri = typeof sel === "number" ? model.rounds.indexOf(sel) : null;
  const allCols = model.rounds.map((_, i) => i);
  const single = !model.multiCat;
  const cols = single ? (sel === "grupo" && model.rounds.length > 1 && model.showBpb ? [] : ri != null ? [ri] : allCols) : allCols;
  const bpbMode: number | "all" | null = !single || !model.showBpb ? null : ri != null ? ri : sel === "grupo" && model.rounds.length > 1 ? "all" : null;
  const disp = single && c0 ? (ri != null ? teamVal(c0, model, ri) : teamVal(c0, model, null)) : null;
  const dispTp = single && c0 ? (ri != null ? c0.rdToPar[ri] : c0.toPar) : null;
  const mdl = c0?.pos != null ? medal(c0.pos) : null;
  return (
    <Tint as="div" className="ts-card" bd={team.isMulti ? team.color + "80" : null}>
      <Tint as="div" className="ts-card-hdr" bg={team.color}>
        {model.showLetter && team.letter && (
          <div className="shrink-0 fw-900 u-w-34px u-h-34px u-bg-rgba-255-255-255-0_18 u-br-radius u-d-flex u-ai-center u-jc-center u-fs-fs-20 u-lh-1">
            {team.letter}
          </div>
        )}
        <div className="flex-1 u-minw-0">
          <div className="fs-12 fw-700 overflow-hidden u-lh-1_3 u-tov-ellipsis u-ws-nowrap">{team.name}</div>
          {team.sub && <div className="fs-10 fw-600 mt-1 u-op-0_8">{team.sub}</div>}
        </div>
        {/* Uma categoria: lugar + total (ou a volta escolhida). Com categorias o
            lugar vive em cada categoria (são campeonatos à parte). */}
        {single && c0?.pos != null && disp != null && (
          <div className="shrink-0 ta-right">
            <div className="fs-10 u-op-0_85 u-lh-1 u-mb-2px">{ri != null ? `R${sel}` : (mdl ?? `#${c0.pos}`)}</div>
            <div className="fw-900 u-fs-fs-20 u-lh-1">{model.rankBy === "toPar" ? tpTxt(disp) : disp}</div>
            {model.rankBy !== "toPar" && dispTp != null && (
              <div className="fs-10 mt-1 u-op-0_85 u-lh-1">({fmtToPar(dispTp)})</div>
            )}
          </div>
        )}
      </Tint>
      {team.cats.map((cat, idx) => (
        <div key={cat.key} className={model.multiCat && idx > 0 ? "u-mt-10px" : undefined}>
          {model.multiCat && (
            <div className={"ts-cat-hdr" + (idx === 0 ? " first" : "") + (cat.pos === 1 ? " win" : "")}>
              <span>
                {cat.pos != null && (
                  <Tint className={"u-fw-900 u-mr-6px" + (cat.pos === 1 ? "" : " u-c-text-2")} fg={cat.pos === 1 ? team.color : null}>
                    {cat.pos === 1 ? "🏆 " : ""}#{cat.pos}{cat.fieldSize > 1 ? `/${cat.fieldSize}` : ""}
                  </Tint>
                )}
                {cat.label}
              </span>
              <span className="u-c-text-muted u-fw-600">{cat.nLabel}</span>
            </div>
          )}
          <PlayersTable cat={cat} model={model} color={team.color} cols={cols} bpbMode={bpbMode}
            showTotal={single ? cols.length > 1 : model.rounds.length > 1} />
        </div>
      ))}
      {(team.capitao || team.suplente) && (
        <div className="u-d-flex u-bt-1px-solid-border u-fs-fs-11">
          {team.capitao && (
            <div className={"ts-capitao u-fl-1 u-p-4px-10px u-d-flex u-ai-center u-gap-4px u-c-text-2" + (team.suplente ? " split" : "")}>
              <span className="fs-13">🎖️</span>
              <span>
                <span className="u-fs-fs-9 u-fw-700 u-tt-uppercase u-ls-0_05em u-c-text-muted u-d-block u-lh-1">Capitão</span>
                <span className="u-fw-600 u-c-text">{team.capitao}</span>
              </span>
            </div>
          )}
          {team.suplente && (
            <div className="u-fl-1 u-p-4px-10px u-d-flex u-ai-center u-gap-4px u-c-text-2">
              <span className="fs-13">🔄</span>
              <span>
                <span className="u-fs-fs-9 u-fw-700 u-tt-uppercase u-ls-0_05em u-c-text-muted u-d-block u-lh-1">Suplente</span>
                <span className="u-fw-600 u-c-text">{team.suplente}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </Tint>
  );
}

/* ── Lista: uma linha por equipa (por categoria), que se abre nos jogadores ── */
type LKey = "pos" | "equipa" | "tot" | "tp" | "n" | `r${number}`;
function TeamList({ model, catKey, label, nLabel }: { model: TsModel; catKey: string; label?: string; nLabel?: string }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<LKey>("pos", "asc");
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    const list = model.teams.map(t => ({ t, c: t.cats.find(c => c.key === catKey) })).filter((x): x is { t: TsTeam; c: TsCat } => !!x.c);
    const v = ({ t, c }: { t: TsTeam; c: TsCat }): number | string => {
      if (sortKey === "equipa") return t.name;
      if (sortKey === "pos") return c.pos ?? INF;
      if (sortKey === "tot") return c.total ?? INF;
      if (sortKey === "tp") return c.toPar ?? INF;
      if (sortKey === "n") return c.players.length;
      const ri = parseInt(sortKey.slice(1), 10);
      return c.rdTotals[ri] ?? INF;
    };
    return list.sort((a, b) => {
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * av.localeCompare(bv as string, "pt");
      return dir * ((av as number) - (bv as number)) || a.t.name.localeCompare(b.t.name, "pt");
    });
  }, [model, catKey, sortKey, sortDir]);
  const byGross = model.rankBy === "gross";
  const nCols = 2 + (byGross ? model.rounds.length + 1 : 0) + 2;
  const hdr = (k: LKey, l: React.ReactNode, cls?: string, title?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls} title={title}>{l}</SortableHdr>;
  return (
    <div className="mb-16">
      {label && <SectionTitle as="div" sub={nLabel}>{label}</SectionTitle>}
      <div className="sc-wrap">
        <table className="dtable tbl-compact">
          <thead>
            <tr>
              {hdr("pos", "Pos.")}
              {hdr("equipa", model.rankBy === "toPar" ? "Região" : "Equipa", "u-ta-left")}
              {byGross && model.rounds.map((rd, ri) => <React.Fragment key={rd}>{hdr(`r${ri}`, `R${rd}`)}</React.Fragment>)}
              {byGross && hdr("tot", "Total")}
              {hdr("tp", byGross ? "±Par" : "10 melhores", undefined, byGross ? undefined : "Soma dos 10 melhores resultados em relação ao par")}
              {hdr("n", "Jogadores", undefined, "Jogadores com resultado")}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, c }) => {
              const open = aberta === t.key;
              return (
                <React.Fragment key={t.key}>
                  <tr onClick={() => setAberta(open ? null : t.key)} className={"u-cur-pointer" + (open ? " row-selected" : "")}
                    title="Clicar para ver os jogadores">
                    <td className="ta-c fw-700">{c.pos != null ? (medal(c.pos) ?? c.pos) : "–"}</td>
                    <td className="u-ta-left u-ws-nowrap">
                      {t.isMulti && <Tint className="legend-dot shrink-0 u-mr-6px" bg={t.color} />}
                      {model.showLetter && t.letter && <b className="u-mr-6px">{t.letter}</b>}
                      {t.name}{t.sub && <span className="muted fs-11"> · {t.sub}</span>}
                      <span className="muted fs-11"> <ExpandArrow open={open} /></span>
                    </td>
                    {byGross && c.rdTotals.map((v, ri) => <td key={ri} className="ta-c">{v ?? "–"}</td>)}
                    {byGross && <td className="ta-c fw-700">{c.total ?? "–"}</td>}
                    <td className="ta-c fw-700">{byGross ? (c.toPar != null ? fmtToPar(c.toPar) : "–") : tpTxt(c.toPar)}</td>
                    <td className="ta-c">{c.players.length}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={nCols} className="u-p-0 u-bg-bg-card">
                        <PlayersTable cat={c} model={model} color={t.color} cols={model.rounds.map((_, i) => i)}
                          bpbMode={null} showTotal={model.rounds.length > 1} />
                        {(t.capitao || t.suplente) && (
                          <div className="fs-11 muted u-p-4px-10px">
                            {t.capitao && <>🎖️ Capitão: <b>{t.capitao}</b></>}{t.capitao && t.suplente && " · "}{t.suplente && <>🔄 Suplente: <b>{t.suplente}</b></>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Jogadores: todos numa tabela ── */
type JKey = "equipa" | "cat" | "nome" | "hcp" | "bur" | "tot" | "conta" | `r${number}`;
function AllPlayers({ model }: { model: TsModel }) {
  const [equipa, setEquipa] = useState<string>("");
  const { sortKey, sortDir, toggleSort } = useSort<JKey>(model.rankBy === "toPar" ? "r0" : "tot", "asc");
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    const all = model.teams.filter(t => !equipa || t.key === equipa)
      .flatMap(t => t.cats.flatMap(c => c.players.map(p => ({ t, c, p }))));
    const v = ({ t, c, p }: typeof all[number]): number | string => {
      switch (sortKey) {
        case "equipa": return (c.pos ?? 999) * 1000 + (model.teams.indexOf(t));
        case "cat": return c.label;
        case "nome": return p.name;
        case "hcp": return p.hcpSort ?? 999;
        case "bur": return p.holes ?? INF;
        case "tot": return p.total ?? INF;
        case "conta": return p.conta ? 0 : 1;
        default: { const r = p.rds[parseInt(sortKey.slice(1), 10)]; return (model.rankBy === "toPar" ? r?.toPar : r?.gross) ?? INF; }
      }
    };
    return all.sort((a, b) => {
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * av.localeCompare(bv as string, "pt");
      return dir * ((av as number) - (bv as number)) || a.p.name.localeCompare(b.p.name, "pt");
    });
  }, [model, equipa, sortKey, sortDir]);
  const hdr = (k: JKey, l: React.ReactNode, cls?: string, title?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={cls} title={title}>{l}</SortableHdr>;
  return (
    <div>
      <div className="mb-8 u-d-flex u-ai-center u-gap-8px u-fwr-wrap">
        <Select variant="compact" value={equipa} onChange={setEquipa}>
          <option value="">{model.rankBy === "toPar" ? "Todas as regiões" : "Todas as equipas"}</option>
          {model.teams.map(t => <option key={t.key} value={t.key}>{t.letter && model.showLetter ? `${t.letter} · ` : ""}{t.name}{t.sub ? ` (${t.sub})` : ""}</option>)}
        </Select>
        <span className="muted fs-12">{rows.length} jogadores{model.showConta ? " · ✓ = resultado que conta para a equipa" : " · a negrito, os resultados que contam para a equipa"}</span>
      </div>
      <div className="sc-wrap">
        <table className="dtable tbl-compact">
          <thead>
            <tr>
              {hdr("equipa", model.rankBy === "toPar" ? "Região" : "Equipa", "u-ta-left")}
              {model.multiCat && hdr("cat", "Categoria", "u-ta-left")}
              {hdr("nome", "Jogador", "u-ta-left")}
              {model.showHcp && hdr("hcp", "HCP")}
              {model.showHoles && hdr("bur", "Bur.", undefined, "Sub-10 joga 9 buracos")}
              {model.rounds.map((rd, ri) => <React.Fragment key={rd}>{hdr(`r${ri}`, model.rankBy === "toPar" ? "Gross (±Par)" : `R${rd}`)}</React.Fragment>)}
              {model.rounds.length > 1 && hdr("tot", "Tot.")}
              {model.showConta && hdr("conta", "Conta", undefined, "Entra no total da equipa")}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, c, p }) => (
              <tr key={t.key + c.key + p.key} className={isEu(p) ? "row-manuel" : undefined}>
                <td className="u-ta-left u-ws-nowrap">{model.showLetter && t.letter ? <b>{t.letter} </b> : null}{t.name}</td>
                {model.multiCat && <td className="u-ta-left">{c.label}</td>}
                <td className="u-ta-left"><PName p={p} /></td>
                {model.showHcp && <td className="ta-c muted">{p.hcp}</td>}
                {model.showHoles && <td className="ta-c">{p.holes ?? "–"}</td>}
                {p.rds.map((r, ri) => <ScoreCell key={ri} r={r} color={t.color} />)}
                {model.rounds.length > 1 && <td className="ta-c">{p.total ?? "–"}</td>}
                {model.showConta && <td className="ta-c">{p.conta ? "✓" : ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── A peça ─────────────────────────────────────────────────────── */
export default function TeamStrokeStandings({ model, intro, initialView, footnote }: {
  model: TsModel;
  /** Texto por cima (default: a regra do modelo). */
  intro?: React.ReactNode;
  initialView?: View;
  /** Nota extra por baixo da regra (ex.: a fonte do PDF da Final Drive). */
  footnote?: React.ReactNode;
}) {
  const [view, setView] = useState<View>(initialView ?? (model.rankBy === "toPar" ? "lista" : "cartoes"));
  const { sortKey: sel, sortDir, toggleSort } = useSort<RoundSel>("total");
  const single = !model.multiCat;
  const played = model.rounds.length;

  // Ordem dos cartões: uma categoria — pela escolha (Grupo/Rn/Total); com
  // categorias — pela melhor posição do clube em qualquer categoria.
  const cards = useMemo(() => {
    if (!single) {
      return [...model.teams].sort((a, b) => {
        const ba = Math.min(...a.cats.map(c => c.pos ?? Infinity), Infinity);
        const bb = Math.min(...b.cats.map(c => c.pos ?? Infinity), Infinity);
        return ba - bb || a.name.localeCompare(b.name, "pt");
      });
    }
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    return [...model.teams].sort((a, b) => {
      if (sel === "grupo") return (sortDir === "asc" ? 1 : -1) * (a.letter ?? a.name).localeCompare(b.letter ?? b.name);
      const ri = typeof sel === "number" ? model.rounds.indexOf(sel) : null;
      const av = (a.cats[0] ? teamVal(a.cats[0], model, ri) : null) ?? INF;
      const bv = (b.cats[0] ? teamVal(b.cats[0], model, ri) : null) ?? INF;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [model, single, sel, sortDir]);

  const SelBtn = ({ label, col }: { label: string; col: RoundSel }) => {
    const active = sel === col;
    return (
      <button type="button" onClick={() => toggleSort(col)} aria-pressed={active}
        className={"tourn-tab tourn-tab-sm" + (active ? " active" : "")}>{label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</button>
    );
  };

  const views: { k: View; l: string }[] = [{ k: "cartoes", l: "Cartões" }, { k: "lista", l: "Lista" }, { k: "jogadores", l: "Jogadores" }];
  const catsForList = model.multiCat
    ? [...new Map(model.teams.flatMap(t => t.cats.map(c => [c.key, c] as const))).values()]
    : [model.teams[0]?.cats[0]].filter((c): c is TsCat => !!c);

  return (
    <div className="u-p-12px-16px-24px">
      <div className="mb-10 flex-wrap u-d-flex u-ai-center u-gap-6px">
        <TabRow ariaLabel="Vista" active={view} onChange={setView} tabs={views.map(v => ({ key: v.k, label: v.l }))} />
        {view === "cartoes" && single && (played > 1 || model.showLetter) && (<>
          <span className="u-fs-fs-10 u-c-text-muted u-ml-6px">Ordenar:</span>
          {model.showLetter && <SelBtn label="Grupo" col="grupo" />}
          {model.rounds.map(rd => <SelBtn key={rd} label={`R${rd}`} col={rd} />)}
          <SelBtn label="Total" col="total" />
        </>)}
        <span className="u-ml-auto u-fs-fs-13 u-c-text-muted u-mt-4px">
          {intro ?? model.rule}
          {model.nRounds > 1 && played > 0 && (
            <span className={`u-ml-8px u-fw-600${single ? (played >= model.nRounds ? " tone-good" : " u-c-var-color-warn-e07b00") : ""}`}>
              · R{played}/{model.nRounds}
            </span>
          )}
        </span>
      </div>
      {footnote && <div className="muted fs-12 mb-10">{footnote}</div>}

      {/* Clubes com 2+ equipas */}
      {model.legend.length > 0 && view !== "jogadores" && (
        <div className="flex-wrap mb-12 u-d-flex u-gap-6px">
          {model.legend.map(l => (
            <Tint key={l.clube} className="ts-legend" bd={l.color} bg={`${l.color}12`}>
              <Tint className="legend-dot shrink-0" bg={l.color} />
              <Tint as="strong" fg={l.color}>{l.teams}</Tint>
              <span className="u-c-text-muted">— {l.clube}</span>
            </Tint>
          ))}
        </div>
      )}

      {view === "cartoes" && (
        <div className={"u-d-grid ts-cards " + (model.multiCat ? "multi u-gap-12px" : "u-gap-10px")}>
          {cards.map(t => <TeamCard key={t.key} team={t} model={model} sel={sel} />)}
        </div>
      )}
      {view === "lista" && catsForList.map(c => (
        <TeamList key={c.key} model={model} catKey={c.key} label={model.multiCat ? c.label : undefined} nLabel={model.multiCat ? c.nLabel : undefined} />
      ))}
      {view === "jogadores" && <AllPlayers model={model} />}
    </div>
  );
}
