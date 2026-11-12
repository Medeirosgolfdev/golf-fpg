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

import { useMemo, useState, Fragment } from "react";
import { fmtToPar } from "../utils/format";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import type { Tournament } from "../data/fpgTypes";
import type { Champion } from "../data/jovensAnaliseData";
import ExpandArrow from "./ExpandArrow";
import PlayerLink from "./PlayerLink";

import SectionTitle from "./SectionTitle";
import { playerKey } from "../utils/playerKey";
import FpgTournLink from "./FpgTournLink";
import { somaDe } from "../utils/mathUtils";
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

  const totalTitles = somaDe(top, c => c.titles.length);
  const totalAthletes = somaDe(top, c => c.athletes.length);

  return (
    <section
      className="u-m-16px-12px-24px u-bd-1px-solid-border u-br-radius-lg u-ov-hidden"
    >
      <header
        className="u-p-10px-14px u-bg-bg-muted u-bb-1px-solid-border u-d-flex u-ai-center u-gap-12px u-fwr-wrap"
      >
        <SectionTitle size="lg" className="u-m-0">
          🏛️ Top {MAX_CLUBS} Clubes · Títulos Nacional de Jovens
        </SectionTitle>
        <span className="muted fs-12">
          {top.length} clubes · {totalTitles} títulos · {totalAthletes} atletas distintos
        </span>
      </header>
      <div className="u-ox-auto u-pb-14px">
        <table className="dtable">
          <thead>
            <tr>
              <th className="u-w-32px">#</th>
              <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>
                Clube
              </SortableHdr>
              <SortableHdr
                k="titles"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="u-ta-right"
              >
                Títulos
              </SortableHdr>
              <SortableHdr
                k="athletes"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="u-ta-right"
              >
                Atletas
              </SortableHdr>
              <SortableHdr
                k="escaloes"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="u-ta-right"
              >
                Escalões
              </SortableHdr>
              <SortableHdr k="years" sortKey={sortKey} sortDir={sortDir} onSort={onSort}>
                Anos
              </SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, idx) => {
              const isOpen = expanded.has(c.key);
              const ys = [...c.years].sort((a, b) => a - b);
              return (
                <Fragment key={c.key}>
                  <tr
                    className={isOpen ? "u-cur-pointer u-bg-bg-info-subtle" : "u-cur-pointer"}
                    onClick={() => toggle(c.key)}
                    title={isOpen ? "Fechar detalhes" : "Ver atletas e títulos"}
                  >
                    <td
                      className="u-ff-font-mono u-fs-fs-11 u-c-text-3"
                    >
                      {idx + 1}
                    </td>
                    <td>
                      <span className="u-d-inline-flex u-ai-center u-gap-6px">
                        <span
                          className="u-ff-font-mono u-fs-fs-11 u-op-0_6 u-w-10px"
                        >
                          <ExpandArrow open={isOpen} />
                        </span>
                        <span className="fw-700">{c.displayName}</span>
                      </span>
                    </td>
                    <td
                      className="r u-fw-800 u-c-accent"
                    >
                      {c.titles.length}
                    </td>
                    <td
                      className="r"
                    >
                      {c.athletes.length}
                    </td>
                    <td
                      className="r"
                      title={[...c.escaloes].join(", ")}
                    >
                      {c.escaloes.size}
                    </td>
                    <td className="u-fs-fs-11 u-c-text-3">
                      {ys.length === 1 ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`} ({ys.length})
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={c.key + "-details"}>
                      <td
                        colSpan={6}
                        className="u-p-10px-12px-14px-36px u-bg-bg-info-subtle"
                      >
                        {/* Atletas (resumo) */}
                        <div className="u-mb-10px">
                          <div
                            className="fs-11 fw-700 muted u-tt-uppercase u-ls-0_3px u-mb-4px"

                          >
                            Atletas com títulos por este clube
                          </div>
                          <div className="u-d-flex u-fwr-wrap u-gap-6px">
                            {c.athletes.map((a) => (
                              <span
                                key={playerKey(a.fed, a.name) + "-tag"}
                                className="u-d-inline-flex u-ai-center u-gap-6px u-p-3px-8px u-br-radius-xl u-bg-bg-card u-bd-1px-solid-border-light u-fs-fs-12"
                              >
                                {a.fed ? (
                                  <PlayerLink fed={a.fed} name={a.name} query="?view=federado" className="fw-700" title={`${a.name} — ver perfil federado (nova janela)`} />
                                ) : (
                                  <span className="fw-700">{a.name}</span>
                                )}
                                <span
                                  className="u-fs-fs-11 u-fw-700 u-c-accent"
                                >
                                  ×{a.count}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Títulos detalhados */}
                        <table className="dtable dtable-sm u-mt-4px">
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Esc</th>
                              <th>Sx</th>
                              <th>Atleta</th>
                              <th className="r">Total</th>
                              <th className="r">±Par</th>
                              <th>Torneio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.titles.map((t, i) => (
                              <tr key={i}>
                                <td className="u-ws-nowrap">{t.date}</td>
                                <td>{t.escalao}</td>
                                <td>{t.sex}</td>
                                <td>
                                  {t.athleteFed ? (
                                    <PlayerLink fed={t.athleteFed} name={t.athleteName} query="?view=federado" title="Ver perfil federado (nova janela)" />
                                  ) : (
                                    t.athleteName
                                  )}
                                </td>
                                <td className="r u-fw-600">{t.gross ?? "—"}</td>
                                <td className="r">{t.toPar != null ? fmtToPar(t.toPar) : "—"}</td>
                                <td>
                                  <FpgTournLink ccode={t.ccode} tcode={t.tcode} name={t.tournamentName} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
