/**
 * TournamentGrid — Cross-season tournament grid for Sub-12 players
 *
 * O escalão mostrado na coluna do jogador é calculado pela regra FPG year-based
 * (`escalaoAtDate(dob, year)`), usando o ano do torneio mais recente do jogador
 * visível na grelha. Isto evita mostrar "Sub-14" (escalão actual) num ranking
 * histórico onde o jogador era Sub-10/12.
 */
import React, { useMemo } from "react";
import { useSort } from "../hooks/useSort";
import { fmtToPar, fmtHcp, shortDateSlash, escalaoAtDate } from "../utils/format";
import { SC, sdClassByHcp } from "../utils/scoreDisplay";
import { CrossSeasonTable, SortTh as _CSortTh } from "./CrossSeasonTable";
import PlayerLink from "./PlayerLink";
import EmptyState from "./EmptyState";
import { escPillCls } from "../utils/playerUtils";
import { isManuel, TournPName, type PlayersDB } from "./tournamentPrimitives";
import type { Sub12Row, EscLookup } from "./driveTypes";

// Wrapper que aceita style (não incluído nos props originais de SortTh)
const CSortTh = _CSortTh as React.ComponentType<
  React.ComponentProps<typeof _CSortTh> & { style?: React.CSSProperties }
>;

function TournamentGrid({
  rows,
  allTournaments,
  onPlayerClick,
  playersDB,
  escLookup: _escLookup,
}: {
  rows: Sub12Row[];
  allTournaments: {
    key: string;
    short: string;
    date: string;
    series: string;
    campo?: string;
    nholes?: number;
  }[];
  onPlayerClick: (fed: string) => void;
  playersDB: PlayersDB;
  escLookup?: EscLookup;
}) {
  type S12SortKey =
    | "name"
    | "fed"
    | "escalao"
    | "club"
    | "hcp"
    | "played"
    | "avgSD"
    | "avgGross"
    | string;
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<S12SortKey>("totalPts", "desc");

  /** Escalão do jogador para a grelha: year-based no ano mais recente dos seus resultados.
   *  Fallback para o escalão actual da playersDB se não houver DOB. */
  const escalaoDeRow = React.useCallback((p: Sub12Row): string => {
    const db = playersDB[p.fed];
    const dob = (db as any)?.dob as string | undefined;
    if (dob && p.results.length > 0) {
      // Ano mais recente dos resultados do jogador
      const mostRecentYear = p.results.reduce((max, r) => {
        const y = parseInt(String(r.date).slice(0, 4));
        return !isNaN(y) && y > max ? y : max;
      }, 0);
      if (mostRecentYear > 0) {
        const calc = escalaoAtDate(dob, mostRecentYear);
        if (calc) return calc;
      }
    }
    return db?.escalao || "";
  }, [playersDB]);

  const sorted = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const INF = 9999;
      switch (sortKey) {
        case "name":
          return mult * a.name.localeCompare(b.name, "pt");
        case "fed":
          return mult * (a.fed || "").localeCompare(b.fed || "");
        case "escalao": {
          const ea = escalaoDeRow(a);
          const eb = escalaoDeRow(b);
          return mult * ea.localeCompare(eb, "pt");
        }
        case "club":
          return mult * (a.club || "").localeCompare(b.club || "", "pt");
        case "hcp":
          return mult * ((a.hcp ?? INF) - (b.hcp ?? INF));
        case "totalBird":
          return mult * (b.totalBird - a.totalBird);
        case "totalPars":
          return mult * (b.totalPars - a.totalPars);
        case "totalBog":
          return mult * (a.totalBog - b.totalBog);
        case "totalPts":
          return mult * (b.totalPts - a.totalPts);
        case "avgSD":
          return mult * ((a.avgSD ?? INF) - (b.avgSD ?? INF));
        case "bestSD":
          return mult * ((a.bestSD ?? INF) - (b.bestSD ?? INF));
        case "avgGross":
          return mult * ((a.avgGross ?? INF) - (b.avgGross ?? INF));
        default: {
          if (sortKey.startsWith("gross_")) {
            const tk = sortKey.replace("gross_", "");
            const va = a.results.find((r) => r.tournKey === tk)?.gross ?? INF;
            const vb = b.results.find((r) => r.tournKey === tk)?.gross ?? INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("toPar_")) {
            const tk = sortKey.replace("toPar_", "");
            const va = a.results.find((r) => r.tournKey === tk)?.toPar ?? INF;
            const vb = b.results.find((r) => r.tournKey === tk)?.toPar ?? INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("sd_")) {
            const tk = sortKey.replace("sd_", "");
            const va = a.results.find((r) => r.tournKey === tk)?.sd ?? INF;
            const vb = b.results.find((r) => r.tournKey === tk)?.sd ?? INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("pos_")) {
            const tk = sortKey.replace("pos_", "");
            const va =
              typeof a.results.find((r) => r.tournKey === tk)?.pos === "number"
                ? (a.results.find((r) => r.tournKey === tk)?.pos as number)
                : INF;
            const vb =
              typeof b.results.find((r) => r.tournKey === tk)?.pos === "number"
                ? (b.results.find((r) => r.tournKey === tk)?.pos as number)
                : INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("bird_")) {
            const tk = sortKey.replace("bird_", "");
            const va = a.results.find((r) => r.tournKey === tk)?.birdies ?? -1;
            const vb = b.results.find((r) => r.tournKey === tk)?.birdies ?? -1;
            return mult * (vb - va); // mais birdies = melhor
          }
          if (sortKey.startsWith("par_")) {
            const tk = sortKey.replace("par_", "");
            const va = a.results.find((r) => r.tournKey === tk)?.pars ?? -1;
            const vb = b.results.find((r) => r.tournKey === tk)?.pars ?? -1;
            return mult * (vb - va);
          }
          if (sortKey.startsWith("bog_")) {
            const tk = sortKey.replace("bog_", "");
            const va = a.results.find((r) => r.tournKey === tk)?.bogeys ?? 999;
            const vb = b.results.find((r) => r.tournKey === tk)?.bogeys ?? 999;
            return mult * (va - vb); // menos bogeys = melhor
          }
          return 0;
        }
      }
    });
  }, [rows, sortKey, sortDir, playersDB, escalaoDeRow]);

  // Mesmas constantes exactas do ResumoTable

  /** Variante local intencional: lógica invertida (negativo=danger, positivo=neutro) — específica do CrossSeason DRIVE */
  const tpColor2 = (v: number | null) =>
    v == null ? undefined : v < 0 ? SC.danger : v === 0 ? SC.good : undefined;

  const shortDate = shortDateSlash;

  return (
    <CrossSeasonTable
      identityHeaders={
        <>
          <CSortTh k="name" s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">
            #
          </CSortTh>
          <CSortTh
            k="name"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-name sticky-col-1"
          >
            Jogador
          </CSortTh>
          <CSortTh k="fed" s={sortKey} d={sortDir} on={handleSort} className="cs-fed">
            Fed
          </CSortTh>
          <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">
            Esc.
          </CSortTh>
          <CSortTh k="club" s={sortKey} d={sortDir} on={handleSort} className="cs-club">
            Clube
          </CSortTh>
          <CSortTh k="hcp" s={sortKey} d={sortDir} on={handleSort} className="cs-hcp cs-id-end">
            HCP
          </CSortTh>
        </>
      }
      groups={allTournaments.map((t) => ({
        key: t.key,
        headerTh: (
          <th key={t.key} colSpan={7} className="cs-grp" style={{ lineHeight: 1.3 }}>
            <div className="fw-800 fs-13">{t.short}</div>
            <div className="c-muted fs-10-fw5">
              {shortDate(t.date)}
              {t.campo ? " · " + t.campo : ""}
              {t.nholes ? " · " + t.nholes + "h" : ""}
            </div>
          </th>
        ),
        subHeaderThs: (
          <React.Fragment key={t.key}>
            <CSortTh
              k={"pos_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-pos cs-grp"
            >
              #
            </CSortTh>
            <CSortTh
              k={"gross_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-gross cs-col"
            >
              Gross
            </CSortTh>
            <CSortTh
              k={"toPar_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-topar cs-col"
            >
              ±Par
            </CSortTh>
            <CSortTh
              k={"sd_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-sd cs-col"
            >
              SD
            </CSortTh>
            <CSortTh
              k={"bird_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-stat cs-col"
            >
              🐦
            </CSortTh>
            <CSortTh
              k={"par_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-stat cs-col"
            >
              Par
            </CSortTh>
            <CSortTh
              k={"bog_" + t.key}
              s={sortKey}
              d={sortDir}
              on={handleSort}
              className="cs-t-stat cs-col"
            >
              ■
            </CSortTh>
          </React.Fragment>
        ),
      }))}
      summaryGroupTh={
        <th className="cs-grp u-fw8-fs12" colSpan={6}>
          Temporada
        </th>
      }
      summarySubHeaders={
        <>
          <CSortTh
            k="played"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-games cs-grp"
          >
            Jogos
          </CSortTh>
          <CSortTh
            k="totalPts"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-pts cs-col"
            style={{ color: "var(--color-warn-dark)" }}
          >
            Pts
          </CSortTh>
          <CSortTh
            k="bestSD"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-sd cs-col"
          >
            Best SD
          </CSortTh>
          <CSortTh
            k="totalBird"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-stat cs-col"
          >
            🐦
          </CSortTh>
          <CSortTh
            k="totalPars"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-stat cs-col"
          >
            Par
          </CSortTh>
          <CSortTh
            k="totalBog"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-stat cs-col"
          >
            ■
          </CSortTh>
        </>
      }
    >
      {sorted.map((p, idx) => {
        const escalao = escalaoDeRow(p);
        const cls = escPillCls(escalao);
        return (
          <tr
            key={p.fed}
            className={"pointer" + (isManuel(p) ? " row-manuel" : "")}
            onClick={() => onPlayerClick(p.fed)}
          >
            <td className="cs-pos sticky-col-0">{idx + 1}</td>
            <td className="cs-name sticky-col-1">
              <TournPName
                name={p.name}
                fed={p.fed || undefined}
                playersDB={playersDB}
                highlight={isManuel(p)}
              />
            </td>
            <td className="cs-fed">{p.fed || "–"}</td>
            <td className="cs-esc">
              {escalao ? (
                <span className={cls + " fs-10"}>{escalao}</span>
              ) : (
                <span className="c-muted fs-10">–</span>
              )}
            </td>
            <td className="cs-club">{p.club}</td>
            <td className="cs-hcp cs-id-end">{fmtHcp(p.hcp)}</td>
            {allTournaments.map((t) => {
              const res = p.results.find((r) => r.tournKey === t.key);
              if (!res) return <td key={t.key} colSpan={7} className="cs-grp" />;
              return (
                <React.Fragment key={t.key}>
                  <td className="cs-t-pos cs-grp">{res.pos ?? "–"}</td>
                  <td className="cs-t-gross cs-col">{res.gross}</td>
                  <td className="cs-t-topar cs-col" style={{ color: tpColor2(res.toPar) }}>
                    {fmtToPar(res.toPar)}
                  </td>
                  <td className="cs-t-sd cs-col" style={{ borderLeft: "1px solid var(--border-light)" }}>
                    {res.sd != null ? (
                      <span className={"p p-sm p-" + sdClassByHcp(res.sd, p.hcp)}>
                        {res.sd.toFixed(1)}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="cs-t-stat cs-col">{res.birdies}</td>
                  <td className="cs-t-stat cs-col">{res.pars}</td>
                  <td className="cs-t-stat cs-col">{res.bogeys}</td>
                </React.Fragment>
              );
            })}
            <td className="cs-s-games cs-grp">{p.tourneiosPlayed}</td>
            <td className="cs-s-pts cs-col">{p.totalPts > 0 ? p.totalPts : "–"}</td>
            <td className="cs-s-sd cs-col">
              {p.bestSD != null ? (
                <span className={"p p-sm p-" + sdClassByHcp(p.bestSD, p.hcp)}>
                  {p.bestSD.toFixed(1)}
                </span>
              ) : (
                "–"
              )}
            </td>
            <td className="cs-s-stat cs-col">{p.totalBird}</td>
            <td className="cs-s-stat cs-col">{p.totalPars}</td>
            <td className="cs-s-stat cs-col">{p.totalBog}</td>
          </tr>
        );
      })}
      {sorted.length === 0 && (
        <tr>
          <td colSpan={99}>
            <EmptyState size="sm" message="Nenhum jogador Sub-12 encontrado" />
          </td>
        </tr>
      )}
    </CrossSeasonTable>
  );
}

export default TournamentGrid;
