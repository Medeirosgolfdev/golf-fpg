/**
 * PlayersView.tsx — Lista de TODOS os jogadores federados espanhóis (RFEG).
 *
 * Análoga à JogadoresListPage portuguesa (federados.json), MESMAS colunas e
 * ordem na medida do possível. Carrega `public/data/spain-players.json`
 * (~16.000 licenças consolidadas), que já traz o nº de torneios (total + ano
 * corrente, TODAS as plataformas) bakado por build-spain-players-export.js.
 *
 * Colunas (ordem igual à PT): Licencia · Jogador · Clube · DOB · Idade · HCP ·
 * Sexo · Categoría · 📊 Tot · 🗓 Ano · Últ. HCP. As colunas que Portugal tem mas
 * Espanha não consegue preencher (bandeira, 🏑 P&P, Score Differential) ficam
 * ocultas — por isso não aparece nenhuma coluna 100% vazia.
 *
 * Renderizada como item especial ("👥 Jugadores") no menu ⓘ Info da página España.
 *
 * A lista em si (pesquisa, filtros, colunas vazias escondidas, ordenação,
 * paginação, linha que abre os torneios) é o esqueleto comum
 * `ui/info/JogadoresFederacao` — aqui fica só o que é da RFEG: os dados, as
 * colunas DOB/Idade/Categoría, a pílula 🔄 e o histórico de licenças.
 */
import { useMemo, type ReactNode } from "react";
import { useJson } from "../../hooks/useJson";
import { EscPill } from "../../ui/PillBadge";
import { compareNullsLast, compareTextNullsLast } from "../../hooks/useSort";
import { formatPlayerName } from "../../utils/playerUtils";
import { displayName, fmtDatePt } from "../../utils/format";
import { isManuelByName } from "../../constants/manuel";
import { PlayerTournaments, type EsPlayerTournamentsFile } from "./PlayerTournaments";
import { MUTED } from "../../ui/tableCells";
import JogadoresFederacao, { colunasComuns, ANO_CORRENTE, type ColunaJogadorFed, type JogadorFedRow } from "../../ui/info/JogadoresFederacao";

interface SpainPlayer {
  licencia: string;
  name: string;
  dob: string | null;
  dobIso: string | null;
  sex: string | null;
  club: string | null;
  catEdad: string | null;
  hcp: number | null;
  hcpDate: string | null;
  nat: string | null;
  /** Contagem de torneios (todas as plataformas) bakada pelo build-spain-players-export. */
  tot?: number;
  ano?: number;
  firstSeenIso?: string | null;
  lastSeenIso?: string | null;
  // ── Dedup de licenças (mudança de clube/região) — ver build-spain-players-export.js.
  /** Chave estável do jogador físico (federação + nº de jogador). */
  dupKey?: string;
  /** Licença primária deste jogador — presente nas ENTRADAS ANTIGAS (escondidas). */
  aliasOf?: string;
  /** Contagem de torneios somada por TODAS as licenças do jogador (na entrada primária). */
  totAll?: number;
  anoAll?: number;
  /** HCP/data "vivos" quando a licença mais recente em torneio não é a do HCP mais recente. */
  curHcp?: number | null;
  curHcpDate?: string | null;
  /** Licenças antigas (clubes anteriores), mais recente primeiro (na entrada primária). */
  aliases?: SpainLicAlias[];
}
interface SpainLicAlias {
  licencia: string;
  club: string | null;
  hcp: number | null;
  hcpDate: string | null;
  firstSeenIso: string | null;
  lastSeenIso: string | null;
  tot: number;
  ano: number;
}
interface SpainPlayersFile {
  generatedAt: string;
  source: string;
  total: number;
  byLicencia: Record<string, SpainPlayer>;
}

/** Normaliza o catEdad cru do ficheiro (usado só como fallback quando não há
 *  DOB para derivar a categoria pelo ano de nascimento). */
function normCat(c: string | null): string | null {
  if (!c) return null;
  const l = c.trim().toLowerCase();
  if (l === "benjamin") return "Benjamín";
  if (l === "alevin") return "Alevín";
  if (l === "j" || l === "juvenil") return "Juvenil";
  if (l === "infantil") return "Infantil";
  if (l === "cadete") return "Cadete";
  return c.trim();
}
/** Categorias juvenis (para o flag `_young` e o filtro "Só Jovens"). */
const YOUNG = new Set(["Benjamín", "Alevín", "Infantil", "Cadete", "Junior", "Juvenil"]);
/** Categoria RFEG ACTUAL a partir do ano de nascimento (millésime), ano de
 *  referência = o ano corrente. A RFEG usa idade civil (ano-corrente − ano-nascimento),
 *  não a idade exacta. Tabela igual à vista "Categorías de edad RFEG":
 *  ≤10 Benjamín · 11-12 Alevín · 13-14 Infantil · 15-16 Cadete · 17-18 Junior ·
 *  19-21 Juvenil · 22-25 Sub-25 · >25 adulto (null → cai no catEdad do ficheiro). */
function catFromBirthYear(year: number | null): string | null {
  if (year == null || !Number.isFinite(year)) return null;
  const a = ANO_CORRENTE - year;
  if (a < 0) return null;
  if (a <= 10) return "Benjamín";
  if (a <= 12) return "Alevín";
  if (a <= 14) return "Infantil";
  if (a <= 16) return "Cadete";
  if (a <= 18) return "Junior";
  if (a <= 21) return "Juvenil";
  if (a <= 25) return "Sub-25";
  return null;
}
function ageFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
/** Período em que a licença foi vista em competição — "06/07/2021 → 28/06/2022"
 *  (ou uma só data se apareceu só uma vez) a partir de firstSeen/lastSeen ISO.
 *  É o melhor proxy de "de quando a quando a licença existiu" — a RFEG não expõe
 *  a data oficial de emissão, só as inscrições onde o jogador apareceu. */
function activePeriod(first: string | null, last: string | null): string {
  const a = fmtDatePt(first);
  const b = fmtDatePt(last);
  if (a === "—" && b === "—") return "—";
  if (a === "—" || b === "—") return a === "—" ? b : a;
  return a === b ? a : `${a} → ${b}`;
}

type Row = SpainPlayer & JogadorFedRow & {
  _age: number | null;
};

// ── Colunas (a lista, os filtros e a paginação são do esqueleto comum) ──────────
const C = colunasComuns<Row>("es", {
  tot: "Total de torneios em que apareceu (RFEGolf + FCG)",
  hcpDate: "Última actualização de HCP",
});

const COLUNAS: ColunaJogadorFed<Row>[] = [
  C.nome(),
  C.club,
  {
    k: "dob", label: "DOB", hdrClass: "tight", tem: (r) => !!r.dob,
    cmp: (a, b, m) => compareTextNullsLast(a.dobIso, b.dobIso, m),
    td: (r) => <td className="u-ws-nowrap">{r.dob || MUTED}</td>,
  },
  {
    // (aparece com a «DOB»: as duas ou nenhuma)
    k: "age", label: "Idade", hdrClass: "num", tem: (r) => !!r.dob,
    cmp: (a, b, m) => compareNullsLast(a._age, b._age, m),
    td: (r) => <td className="u-ta-right">{r._age != null ? r._age : MUTED}</td>,
  },
  C.hcp,
  C.sex,
  {
    k: "cat", label: "Categoría", hdrClass: "tight", tem: (r) => !!r._cat,
    cmp: (a, b, m) => compareTextNullsLast(a._cat, b._cat, m, "es"),
    td: (r) => <td>{r._cat ? (r._young ? <EscPill esc={r._cat} /> : <span className="muted fs-11">{r._cat}</span>) : MUTED}</td>,
  },
  C.tot,
  C.ano,
  C.hcpDate,
];

/** Todas as licenças do jogador — a actual e as dos clubes anteriores. */
function licencas(r: Row): string[] {
  return [r.licencia, ...(r.aliases || []).map((a) => a.licencia)];
}

/** Torneios por jogador — ficheiro pesado (~2,5 MB), só se pede ao abrir a 1.ª linha. */
const TORNEIOS = {
  url: "/data/spain-player-tournaments.json",
  ok: (d: EsPlayerTournamentsFile) => !!d.byLicencia,
  render: (file: EsPlayerTournamentsFile, r: Row) => <PlayerTournaments file={file} licencias={licencas(r)} />,
  erro: (
    <>
      Não foi possível carregar <code>spain-player-tournaments.json</code> — corre <code>node scripts/build-spain-player-tournaments.js</code>.
    </>
  ),
};

/** Histórico de licenças de quem mudou de clube/região: as linhas «como apareceriam
 *  sem o agrupamento» — a actual e as anteriores, cada uma com os SEUS valores
 *  (clube, HCP, torneios), não os agregados da linha principal. */
function historicoDeLicencas(r: Row, { colCount, celulas }: { colCount: number; celulas: (row: Row) => ReactNode }) {
  if (!r.aliases) return null;
  const subLics = [
    { lic: r.licencia, cur: true, club: r._club, hcp: r.hcp ?? null, tot: r.tot ?? 0, ano: r.ano ?? 0, hcpDate: r.hcpDate ?? null, first: r.firstSeenIso ?? null, last: r.lastSeenIso ?? null },
    ...r.aliases.map((a) => ({ lic: a.licencia, cur: false, club: a.club ? displayName(a.club) : "", hcp: a.hcp, tot: a.tot, ano: a.ano, hcpDate: a.hcpDate, first: a.firstSeenIso, last: a.lastSeenIso })),
  ];
  return (
    <>
      <tr className="player-list-row-detail">
        <td colSpan={colCount} className="u-bg-bg-detail u-p-6px-12px-3px">
          <span className="muted fs-11 u-fw-600">Histórico de licenças — mudança de clube / região</span>
          <span className="muted fs-10 u-fst-italic u-ml-8px">
            as linhas abaixo são as que existiriam na tabela sem o agrupamento · período = 1ª → última inscrição (a RFEG não publica a data de emissão)
          </span>
        </td>
      </tr>
      {subLics.map((s) => (
        <tr key={s.lic} className="player-list-row u-bg-bg-detail">
          <td className="u-ff-font-mono u-fs-fs-11 u-c-text-muted u-ws-nowrap u-pl-16px">
            <span aria-hidden className="u-mr-4px">{s.cur ? "🟢" : "⚪"}</span>{s.lic}
            {s.cur && <span className="u-ml-6px u-c-accent u-fw-700 u-fs-fs-10">ACTUAL</span>}
            <div className="muted u-fs-fs-10 u-mt-1px u-pl-18px" title="Período em que esta licença apareceu em competição (1ª → última inscrição)">
              {activePeriod(s.first, s.last)}
            </div>
          </td>
          {/* nome, DOB, sexo e categoria são do jogador; o resto é desta licença */}
          {celulas({ ...r, _club: s.club, _hcp: s.hcp, _tot: s.tot, _ano: s.ano, _hcpDate: s.hcpDate })}
        </tr>
      ))}
    </>
  );
}

export function RFEGPlayersView() {
  const { data: raw, loading, error } = useJson<SpainPlayersFile>("/data/spain-players.json");
  const data = raw?.byLicencia ? raw : null;
  const err = error ?? (!loading && !data
    ? "spain-players.json não encontrado. Corre `node scripts/build-spain-players-export.js`." : null);

  const all = useMemo<Row[]>(() => {
    if (!data) return [];
    return Object.values(data.byLicencia)
      // Saltar entradas-placeholder sem nome real (ex: "Jugador" de slots não
      // identificados nos torneios) — poluiriam a lista com contagens absurdas.
      .filter((p) => p.name && p.name.trim().toLowerCase() !== "jugador")
      // Esconder as licenças ANTIGAS de quem mudou de clube: ficam dobradas na
      // entrada primária (campo `aliases`). Uma linha por jogador físico.
      .filter((p) => !p.aliasOf)
      .map((p) => {
        const _name = formatPlayerName(p.name || "");
        const _club = p.club ? displayName(p.club) : "";
        const year = p.dobIso ? parseInt(p.dobIso.slice(0, 4), 10) : null;
        // Categoria ACTUAL pelo ano de nascimento (millésime). O catEdad do ficheiro
        // ficou congelado quando o jogador foi scrapado e desatualiza com a idade —
        // só o usamos como fallback quando não há DOB.
        const _cat = catFromBirthYear(year) ?? normCat(p.catEdad);
        // Licenças/clubes antigos → texto pesquisável (encontrar por licença antiga).
        const alt = (p.aliases || [])
          .map((a) => `${a.licencia} ${a.club ? displayName(a.club) : ""}`)
          .join(" ");
        return {
          ...p,
          _key: p.licencia,
          _name,
          _club,
          _cat,
          _young: _cat ? YOUNG.has(_cat) : false,
          _age: ageFromIso(p.dobIso),
          // Contagens e HCP agregados por todas as licenças do jogador (fallback à própria).
          _tot: p.totAll ?? p.tot ?? 0,
          _ano: p.anoAll ?? p.ano ?? 0,
          _hcp: p.curHcp ?? p.hcp,
          _hcpDate: p.curHcpDate ?? p.hcpDate ?? null,
          _manuel: isManuelByName(_name),
          _hay: `${_name} ${p.licencia} ${_club} ${alt}`.toLowerCase(),
        };
      });
  }, [data]);

  // Quantos jogadores têm mais do que uma licença (mudaram de clube/região).
  const dupCount = useMemo(() => all.reduce((n, p) => n + (p.aliases && p.aliases.length ? 1 : 0), 0), [all]);

  const catOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p._young && p._cat) s.add(p._cat);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [all]);

  return (
    <JogadoresFederacao<Row, EsPlayerTournamentsFile>
      rows={data ? all : null}
      error={err}
      loadingMessage="A carregar jogadores espanhóis..."
      title="👥 Jugadores de España"
      sub={
        <span className="muted">
          {all.length.toLocaleString("pt")} jogadores (de {(data?.total ?? 0).toLocaleString("pt")} licenças RFEG + autonómicas)
          {dupCount > 0 && <> — <b>{dupCount.toLocaleString("pt")}</b> mudaram de clube (🔄 várias licenças)</>}
        </span>
      }
      licLabel="Licencia"
      licExtra={(r, isOpen, toggle) => {
        const nLic = r.aliases ? r.aliases.length + 1 : 1;
        return nLic > 1 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            title={`Mudou de clube — ${nLic} licenças. Clica para ver o histórico.`}
            className={"lic-pill" + (isOpen ? " open" : "")}
          >
            🔄 {nLic}
          </button>
        ) : null;
      }}
      colunas={COLUNAS}
      catOptions={catOptions}
      catClass="u-w-150px"
      jovensTitle="Só escalões juvenis (Benjamín, Alevín, Infantil, Cadete, Juvenil)"
      torneios={TORNEIOS}
      linhasExtra={historicoDeLicencas}
      footer={
        <>
          Fonte: <code>spain-players.json</code> + contagem de torneios de <code>rfegolf-rivals</code>/<code>fcg-rivals</code>.
          DOB · sexo · clube só existem para jogadores vistos nos torneios juvenis scrapados.
        </>
      }
    />
  );
}
