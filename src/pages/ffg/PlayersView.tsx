/**
 * PlayersView.tsx — Lista de TODOS os jogadores vistos nos torneios FFGolf.
 *
 * Análoga à RFEGPlayersView espanhola (/rfeg/info/jugadores), MESMAS colunas e
 * ordem na medida do possível. Carrega `public/data/france-players.json`
 * (~13.000 licenças), que já traz o nº de torneios (total + ano corrente),
 * HCP mais recente e série mais recente bakados por build-france-players.js.
 *
 * Colunas (ordem igual à ES): Licence · Jogador · Clube · Région · HCP · Sexo ·
 * Catégorie · 📊 Tot · 🗓 Ano · Últ. HCP. A FFG NÃO expõe DOB — as colunas
 * DOB/Idade da vista espanhola não existem aqui; a categoria (`cat`) é o
 * escalão mais novo da última época em que houve sinal de idade, calculada por
 * build-france-players.js a partir da série E do nome da prova.
 *
 * Renderizada como item especial ("👥 Joueurs") no menu ⓘ Info da página /ffg.
 *
 * A lista em si (pesquisa, filtros, colunas vazias escondidas, ordenação,
 * paginação, linha que abre os torneios) é o esqueleto comum
 * `ui/info/JogadoresFederacao` — aqui fica só o que é da FFG: os dados, as
 * colunas Ligue/Catégorie/Nasc./Mérite, o filtro de Ligue e a seta ↗ Kids.
 */
import { useCallback, useMemo, useState } from "react";
import { useJson } from "../../hooks/useJson";
import { EscPill } from "../../ui/PillBadge";
import { compareNullsLast, compareTextNullsLast } from "../../hooks/useSort";
import { formatPlayerName } from "../../utils/playerUtils";
import { displayName, fmtSign, fmtOrd } from "../../utils/format";
import { normName } from "../../utils/normName";
import { isManuelByName } from "../../constants/manuel";
import { kidsUrl, KidsArrow } from "../../ui/KidsLink";
import { useJuniorsLinks } from "../../hooks/useKidsLinkMap";
import { ffgEscalaoCanonico } from "../../utils/ffgEscalao";
import { PlayerTournaments, type FfgPlayerTournamentsFile } from "./PlayerTournaments";
import { MUTED } from "../../ui/tableCells";
import Select from "../../ui/Select";
import JogadoresFederacao, { colunasComuns, type ColunaJogadorFed, type JogadorFedRow } from "../../ui/info/JogadoresFederacao";

interface FrancePlayer {
  license: string;
  name: string;
  sex?: "M" | "F" | string;
  country?: string;
  glfLic?: string;
  club?: string;
  region?: string;
  /** Label da série mais recente em que competiu (ex: "U12G", "BENJAMINES"). */
  lastSerie?: string;
  /** Escalão canónico bakado pelo builder (série + nome da prova, época mais
   *  recente com sinal de idade). Fallback à série para ficheiros antigos. */
  cat?: string;
  catYear?: number;
  /** Ano de nascimento EXACTO, do Mérite Jeunes da FFG (`catSrc: "merite"` → o `cat` sai dele). */
  birthYear?: number;
  catSrc?: "merite";
  /** Lugar e médias no Mérite Jeunes (mês `month`, AAAAMM). */
  merite?: { rank: number | null; rankAnn: number | null; moy: number | null; moy6: number | null; nbt: number; idx: number | null; cat: string | null; month: string };
  hcp?: number;
  hcpDate?: string;
  /** Contagem de torneios (portal FFGolf resultats) bakada pelo builder. */
  tot?: number;
  ano?: number;
  firstSeenIso?: string | null;
  lastSeenIso?: string | null;
  /** Outras licenças «E» do mesmo estrangeiro (a FFG dá uma nova a cada prova), juntas a esta linha. */
  licencas?: string[];
}
interface FrancePlayersFile {
  generatedAt: string;
  source: string;
  totalPlayers: number;
  byName: Record<string, FrancePlayer>;
  byLicense: Record<string, FrancePlayer>;
}

/** "Sub-14 (Benjamin)" → { sub: "Sub-14", fr: "Benjamin" }. */
function splitCat(cat: string): { sub: string; fr: string | null } {
  const m = /^(.+?)\s*\((.+)\)$/.exec(cat);
  // «Sub 14» com espaço, como nos separadores e no filtro Escalão.
  return m ? { sub: m[1].replace("-", " "), fr: m[2] } : { sub: cat.replace(/^Sub-/, "Sub "), fr: null };
}

type Row = FrancePlayer & JogadorFedRow & {
  _region: string;
  /** juniorId canónico kids2 (via licença FFG ou nome) — alimenta a seta ↗. */
  _kid: string | null;
};

// ── Colunas (a lista, os filtros e a paginação são do esqueleto comum) ──────────
const C = colunasComuns<Row>("fr", {
  tot: "Total de torneios FFGolf em que apareceu",
  hcpDate: "Data do torneio com o HCP mais recente",
});

const COLUNAS: ColunaJogadorFed<Row>[] = [
  C.nome(
    (r) => (
      <>
        {r.country && r.country !== "FRA" && (
          <span className="muted fs-10 u-ml-6px u-fw-400">{r.country}</span>
        )}
        {r._kid && <KidsArrow to={kidsUrl({ id: r._kid })} title="Ver ficha em Kids" />}
      </>
    ),
    (r) => (r.lastSerie ? `Série mais recente: ${r.lastSerie}` : undefined),
  ),
  C.club,
  {
    k: "region", label: "Ligue", tem: (r) => !!r._region,
    cmp: (a, b, m) => compareTextNullsLast(a._region, b._region, m, "fr"),
    td: (r) => <td className="fs-11" title={r._region}>{r._region || MUTED}</td>,
  },
  C.hcp,
  C.sex,
  {
    k: "cat", label: "Catégorie", hdrClass: "tight", tem: (r) => !!r._cat,
    title: "Escalão do Mérite Jeunes da FFG (ano de nascimento exacto) quando o jogador lá está; senão, o escalão mais novo em que competiu na última época (série ou nome da prova) — jogar acima do escalão é permitido, abaixo não.",
    cmp: (a, b, m) => compareTextNullsLast(a._cat, b._cat, m, "fr"),
    td: (r) => {
      const catParts = r._cat ? splitCat(r._cat) : null;
      return (
        <td title={[r.catSrc === "merite" ? `Mérite Jeunes: ${r.merite?.cat ?? ""} (nascido em ${r.birthYear})` : r.catYear ? `Época ${r.catYear} (inferido das provas)` : null, r.lastSerie ? `Série mais recente: ${r.lastSerie}` : null].filter(Boolean).join(" · ") || undefined}>
          {catParts ? (
            r._young ? (
              <>
                {/* Mesma ordem dos separadores: nome FR, depois o Sub (22/10/2026). */}
                {catParts.fr && <span className="fs-11 u-mr-4px">{catParts.fr}</span>}
                <EscPill esc={catParts.sub} />
              </>
            ) : (
              <span className="muted fs-11">{r._cat}</span>
            )
          ) : MUTED}
        </td>
      );
    },
  },
  {
    k: "birth", label: "Nasc.", hdrClass: "num", tem: (r) => !!r.birthYear,
    title: "Ano de nascimento — do escalão do Mérite Jeunes da FFG",
    cmp: (a, b, m) => compareNullsLast(a.birthYear, b.birthYear, m),
    td: (r) => <td className="u-ta-right">{r.birthYear ?? MUTED}</td>,
  },
  {
    k: "merite", label: "Mérite", hdrClass: "num", tem: (r) => r.merite?.rank != null,
    title: "Lugar no Mérite National Jeunes da FFG (12 meses)",
    cmp: (a, b, m) => compareNullsLast(a.merite?.rank, b.merite?.rank, m),
    td: (r) => (
      <td className="u-ta-right"
        title={r.merite ? [`Mérite Jeunes ${r.merite.month.slice(4)}/${r.merite.month.slice(0, 4)}`, r.merite.rankAnn ? `${fmtOrd(r.merite.rankAnn)} do ano de nascimento` : null, `${r.merite.nbt} provas`, r.merite.moy != null ? `média ${fmtSign(r.merite.moy, 2)} vs SSS` : null, r.merite.idx != null ? `index ${r.merite.idx.toFixed(1)}` : null].filter(Boolean).join(" · ") : undefined}>
        {r.merite?.rank != null ? fmtOrd(r.merite.rank) : MUTED}
      </td>
    ),
  },
  C.tot,
  C.ano,
  C.hcpDate,
];

/** Torneios por jogador — ficheiro pesado (~2,8 MB), só se pede ao abrir a 1.ª linha. */
const TORNEIOS = {
  url: "/data/ffgolf-player-tournaments.json",
  ok: (d: FfgPlayerTournamentsFile) => !!d.byLicense,
  render: (file: FfgPlayerTournamentsFile, r: Row) => <PlayerTournaments file={file} license={r.license} />,
  erro: (
    <>
      Não foi possível carregar <code>ffgolf-player-tournaments.json</code> — corre <code>node scripts/build-france-players.js</code>.
    </>
  ),
};

export function FFGPlayersView() {
  const { data: raw, loading, error } = useJson<FrancePlayersFile>("/data/france-players.json");
  const data = raw?.byLicense ? raw : null;
  const err = error ?? (!loading && !data
    ? "france-players.json não encontrado. Corre `node scripts/build-france-players.js`." : null);
  const [region, setRegion] = useState<string>("ALL");
  // Roster kids2 compacto (juniors-links.json, partilhado com useKidsLinkMap) —
  // as setas ↗ aparecem quando chegar, sem bloquear a tabela.
  const roster = useJuniorsLinks();

  // lic FFG → juniorId (exacto) e normName → juniorId (fallback, 1º vence).
  const kidsByLic = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of roster) {
      const lic = j.ffgLic;
      if (lic && !m.has(lic)) m.set(lic, j.id);
    }
    return m;
  }, [roster]);
  const kidsByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of roster) {
      const nk = normName(j.canonicalName);
      if (!m.has(nk)) m.set(nk, j.id);
      for (const alias of j.aliases) {
        const ak = normName(alias);
        if (!m.has(ak)) m.set(ak, j.id);
      }
    }
    return m;
  }, [roster]);

  const all = useMemo<Row[]>(() => {
    if (!data) return [];
    return Object.values(data.byLicense).map((p) => {
      const _name = formatPlayerName(p.name || "");
      const _club = p.club?.trim() ? displayName(p.club.trim()) : "";
      // `cat` vem do builder (série + nome da prova); a série sozinha só
      // resolve ~1/3 dos jogadores — fallback só para ficheiros pré-2026-07.
      const _cat = p.cat ?? ffgEscalaoCanonico(p.lastSerie);
      return {
        ...p,
        _key: p.license,
        _name,
        _club,
        _region: p.region?.trim() ? displayName(p.region.trim()) : "",
        _cat,
        _young: !!_cat && _cat !== "Adultos",
        _hcp: p.hcp ?? null,
        _hcpDate: p.hcpDate ?? null,
        _tot: p.tot ?? 0,
        _ano: p.ano ?? 0,
        _manuel: isManuelByName(_name),
        _hay: `${_name} ${p.license} ${(p.licencas ?? []).join(" ")} ${_club}`.toLowerCase(),
        _kid: [p.license, ...(p.licencas ?? [])].map((l) => kidsByLic.get(l)).find(Boolean)
          ?? kidsByName.get(normName(_name)) ?? null,
      };
    });
  }, [data, kidsByLic, kidsByName]);

  const catOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p._cat) s.add(p._cat);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
  }, [all]);

  const regionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) if (p._region) s.add(p._region);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
  }, [all]);

  const passaRegiao = useCallback((p: Row) => region === "ALL" || p._region === region, [region]);
  const kidsCount = useMemo(() => all.reduce((n, p) => n + (p._kid ? 1 : 0), 0), [all]);

  return (
    <JogadoresFederacao<Row, FfgPlayerTournamentsFile>
      rows={data ? all : null}
      error={err}
      loadingMessage="A carregar jogadores franceses..."
      title="👥 Joueurs de France"
      sub={
        <span className="muted">
          {all.length.toLocaleString("pt")} jogadores vistos nos torneios do portal FFGolf (por licença)
          {kidsCount > 0 && <> — <b>{kidsCount.toLocaleString("pt")}</b> com ficha kids2 (↗)</>}
          <> · clica numa linha para ver os torneios e resultados</>
        </span>
      }
      licLabel="Licence"
      licTitle={(r) => (r.licencas?.length ? `Também com a licença ${r.licencas.join(", ")} (a FFG dá uma licença E nova a cada prova)` : undefined)}
      licExtra={(r) => (r.licencas?.length ? ` +${r.licencas.length}` : "")}
      colunas={COLUNAS}
      catOptions={catOptions}
      catClass="u-w-170px"
      jovensTitle="Só séries juvenis (Poucet, Poussin, Benjamin, Minime, Cadet, Junior / U8-U21)"
      filtrosExtra={
        <Select variant="filter" value={region} onChange={setRegion} className="u-w-190px">
          <option value="ALL">Todas as ligues</option>
          {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      }
      passaExtra={passaRegiao}
      sigExtra={region}
      torneios={TORNEIOS}
      footer={
        <>
          Fonte: <code>france-players.json</code> (portal resultats FFGolf — GP Jeunes + Compétitions Fédérales juvenis).
          Os torneios GolfGenius (Champ. de France, Internationaux) também contam — ligados por nome ao roster de licenças,
          com dedup dos que o portal já publica. A FFG não expõe DOB; a categoria é o escalão mais novo da última época jogada (série + nome da prova).
          Os torneios de cada jogador vêm de <code>ffgolf-player-tournaments.json</code> (mesmo builder) e abrem na classificação completa da /ffg.
        </>
      }
    />
  );
}
