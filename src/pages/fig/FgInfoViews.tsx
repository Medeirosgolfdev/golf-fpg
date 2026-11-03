/**
 * FgInfoViews.tsx — as vistas do menu ⓘ Info da /fig (como as de /rfeg/info):
 * categorias e legenda das colunas da Federgolf, o ranking juvenil nacional
 * e a ficha de cada jogador do ranking (/fig/jogador/:id).
 *
 * Só peças globais: CategoriasInfo (a mesma da /ffg e da /rfeg),
 * RankingListaView (a mesma do ranking juvenil da /rfeg), RankingTable e
 * RankingDetail (as do EGR/WAGR), EscPill.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CategoriasInfo from "../../ui/info/CategoriasInfo";
import RankingListaView from "../../ui/ranking/RankingListaView";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";
import { EscPill } from "../../ui/PillBadge";
import { MUTED } from "../../ui/tableCells";
import { RankingTable, RankingDetail, nameCell, type RankingCol } from "../../ui/ranking/RankingPage";
import { todayIso, fmtDatePt, fmtOrd } from "../../utils/format";
import { escalaoCanon } from "../../data/model/escalao";
import type { FgIndice } from "../../data/federgolf/types";
import { fgClube, fgNome, fgTitulo } from "../../data/federgolf/toTournament";
import {
  FG_RANKING_CATS, loadFgRanking, loadFgRankingVoltas, fgRankingDoJogador,
  type FgRanking, type FgRankingLinha, type FgRankingVolta,
} from "../../data/federgolf/ranking";

const RANKING_SITE = "https://www.federgolf.it/attivita-agonistica/attivita-giovanile/ranking/";
const fmt1 = (n: number | null | undefined) => (n == null ? MUTED : n.toFixed(1));

/* ── Categorias e legenda ──────────────────────────────────────────── */

/** Categorias juvenis da Federgolf (página de ranking juvenil; idades pelo ano
 *  civil, como na FPG — Manuale Azzurro 2024: Baby nascidos de 2012 em diante,
 *  Pulcini 2010–11, Cadetti 2008–09, Ragazzi 2006–07). */
const CATEGORIAS = [
  { letra: "B", nome: "Baby", min: null, max: 12, fpg: "Sub 12", es: "Alevín (e Benjamín)", fr: "Poussin" },
  { letra: "P", nome: "Pulcini", min: 13, max: 14, fpg: "Sub 14", es: "Infantil", fr: "Benjamin" },
  { letra: "C", nome: "Cadetti", min: 15, max: 16, fpg: "Sub 16", es: "Cadete", fr: "Minime" },
  { letra: "R", nome: "Ragazzi", min: 17, max: 18, fpg: "Sub 18", es: "Junior / Boy", fr: "Cadet" },
];

const LEGENDA: [string, string][] = [
  ["Cat.", "Categoria do jogador: B Baby (Sub 12), P Pulcini (Sub 14), C Cadetti (Sub 16), R Ragazzi (Sub 18). Adultos: D Dilettanti, M Mid-Amateur, S Senior, Ss Super senior."],
  ["Qual.", "Qualificação federativa: B Brevetto, BG Brevetto Giovanile, BN Brevetto Nazionale, GIF Interesse Federale, GIN Interesse Nazionale. Os GIN e GIF são os jogadores que a federação acompanha."],
  ["WAGR", "Lugar no World Amateur Golf Ranking (só os melhores o têm)."],
  ["Hcp", "Índice de handicap (na lista de inscritos) ou handicap de jogo (na classificação)."],
  ["OdM", "Lugar na Ordine di Merito, o ranking nacional italiano (adultos e jovens)."],
  ["Data", "Dia em que se inscreveu na prova."],
  ["Stato", "Ammesso = admitido · In attesa = em espera · Non ammesso / Cancellato = não admitido ou desistiu · Wildcard = convite."],
  ["SD", "Score differential oficial de cada volta, do relatório de handicap da prova («Variazioni HCP»): tee, CR, Slope e SD calculados pela Federgolf."],
];

const TIPOS: [RegExp, string, string][] = [
  [/^Trofe[io] Giovanil[ei] Federal[ei] U16/i, "TGF U16", "Trofei Giovanili Federali Under 16 — provas federais para os mais novos."],
  [/WAGR/i, "TGF WAGR", "Trofei Giovanili Federali que contam para o ranking mundial (WAGR) — os mais fortes."],
  [/^Trofe[io] Giovanil[ei]/i, "TGF", "Trofei Giovanili Federali e outros troféus juvenis (Under 18)."],
  [/^Campionati Nazionali/i, "Campeonatos nacionais", "Campionati Nazionali Baby, Pulcini, Cadetti e Ragazzi — os títulos de cada escalão."],
  [/^Campionati Internazionali/i, "Internacionais de Itália", "Campionato Internazionale d'Italia U16 e U18 (com estrangeiros)."],
];

export function FgCategoriasView({ idx }: { idx: FgIndice }) {
  const ano = Number(todayIso().slice(0, 4));
  const porCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of idx.provas) {
      const esc = escalaoCanon(p.categoria, "it") ?? p.categoria;
      m.set(esc, (m.get(esc) ?? 0) + 1);
    }
    return m;
  }, [idx]);
  // Cada prova conta no primeiro tipo que lhe serve (TGF U16 antes de TGF).
  const porTipo = useMemo(() => TIPOS.map(([re, nome, desc], i) => ({
    nome, desc, n: idx.provas.filter((p) => re.test(p.tipo || "") && !TIPOS.slice(0, i).some(([r]) => r.test(p.tipo || ""))).length,
  })), [idx]);
  // Desenhada pela peça comum CategoriasInfo (a mesma da /ffg e da /rfeg).
  return (
    <CategoriasInfo
      titulo="📚 Categorias e legenda — Itália"
      subtitulo={`Federazione Italiana Golf — categorias juvenis (ano de referência ${ano})`}
      links={[{ label: "🔗 federgolf.it", url: RANKING_SITE }]}
      aviso={<>
        Em Itália há <strong>uma só federação</strong> (Federgolf) e todas as provas juvenis estão
        no mesmo site, com classificação, cartões buraco a buraco, metros, tee, CR/Slope e o SD
        oficial de cada volta. As provas de cada sexo são separadas (Maschile / Femminile).
      </>}
      tabela={{
        colunas: [
          { label: "Cat.", className: "ta-c mono", ordenavel: true }, { label: "Categoria", ordenavel: true },
          { label: "Escalão", ordenavel: true }, { label: "Idade", className: "ta-c" },
          { label: `Nascidos (${ano})`, className: "ta-c mono" }, { label: "FPG 🇵🇹", className: "ta-c" },
          { label: "RFEG 🇪🇸", className: "ta-c" }, { label: "FFG 🇫🇷", className: "ta-c" },
          { label: "Provas na /fig", className: "r mono", ordenavel: true },
        ],
        linhas: CATEGORIAS.map((c) => {
          const esc = escalaoCanon(c.nome, "it") ?? c.nome;
          return {
            key: c.letra,
            celulas: [
              <strong>{c.letra}</strong>, c.nome, <EscPill esc={esc} />,
              c.min == null ? `até ${c.max} anos` : `${c.min}–${c.max} anos`,
              c.min == null ? `${ano - c.max} ou depois` : `${ano - c.max}–${ano - c.min}`,
              c.fpg, c.es, c.fr, porCat.get(esc) ?? MUTED,
            ],
            ordem: [c.letra, c.nome, c.max, null, null, null, null, null, porCat.get(esc) ?? null],
          };
        }),
      }}
      notaTabela={<>
        A idade conta-se pelo ano civil, como na FPG: em {ano}, quem nasceu em {ano - 12} é Baby
        (Under 12) o ano todo. O Manuel (2014) é Baby em 2026 e Pulcini em 2027–2028.
      </>}
      seccoes={[
        {
          titulo: "🗂️ O que quer dizer cada coluna",
          tabela: {
            colunas: [{ label: "Coluna", className: "mono", ordenavel: true }, { label: "Significado" }],
            linhas: LEGENDA.map(([k, v]) => ({ key: k, celulas: [<strong>{k}</strong>, v], ordem: [k, null] })),
          },
        },
        {
          titulo: "🏌️ Tipos de prova",
          tabela: {
            colunas: [{ label: "Tipo", ordenavel: true }, { label: "O que é" }, { label: "Provas na /fig", className: "r mono", ordenavel: true }],
            linhas: porTipo.map((t) => ({ key: t.nome, celulas: [<strong>{t.nome}</strong>, t.desc, t.n || MUTED], ordem: [t.nome, null, t.n] })),
          },
        },
        {
          titulo: "🏆 Ranking juvenil nacional",
          texto: <p className="fs-12">
            A Federgolf faz um ranking por ano, sexo e categoria. Conta a <strong>média de (gross − CR)</strong>{" "}
            das voltas do ano em provas válidas (juvenis, Opens, equipas): quanto mais baixa, melhor.
            Só entra na classificação final quem cumpre o <strong>mínimo de voltas</strong>. Está no menu
            ⓘ, em «Ranking juvenil», com a idade de cada jogador e todas as voltas que contaram.
          </p>,
        },
      ]}
    />
  );
}

/* ── Ranking juvenil ───────────────────────────────────────────────── */

function useFgRanking() {
  const [r, setR] = useState<FgRanking | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadFgRanking().then((d) => { if (alive) setR(d); }).catch((e) => { if (alive) setErro(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);
  return { r, erro };
}

export function FgRankingView() {
  const navigate = useNavigate();
  const { r, erro } = useFgRanking();
  const anos = useMemo(() => (r ? Object.keys(r.anos).sort().reverse() : []), [r]);
  const [ano, setAno] = useState<string>("");
  const [sexo, setSexo] = useState<"M" | "F">("M");
  const [cat, setCat] = useState("12");
  const anoSel = ano || anos[0] || "";

  if (erro) return <ErrorState message="Erro ao carregar o ranking juvenil" detail={erro} />;
  if (!r) return <LoadingState message="A carregar o ranking juvenil…" />;

  const cols: RankingCol<FgRankingLinha>[] = [
    { key: "pos", label: "#", sort: (l) => l.pos, firstDir: "asc", cell: (l) => l.pos ?? MUTED, className: "ta-c" },
    { key: "nome", label: "Jogador", sort: (l) => l.nome, firstDir: "asc", cell: (l) => nameCell(fgNome(l.nome)) },
    { key: "clube", label: "Clube", sort: (l) => l.clube, firstDir: "asc", cell: (l) => fgClube(l.clube) || MUTED },
    { key: "idade", label: "Idade", title: "Idade no ranking da Federgolf", sort: (l) => l.idade, firstDir: "asc", cell: (l) => l.idade ?? MUTED, className: "ta-c" },
    { key: "zona", label: "Zona", sort: (l) => l.zona, firstDir: "asc", cell: (l) => l.zona ?? MUTED, className: "ta-c" },
    { key: "qual", label: "Qual.", title: "B Brevetto · BG Brevetto Giovanile · BN Brevetto Nazionale · GIF Interesse Federale · GIN Interesse Nazionale", sort: (l) => l.qual, cell: (l) => l.qual || MUTED, className: "ta-c" },
    { key: "voltas", label: "Voltas", sort: (l) => l.voltas, firstDir: "desc", cell: (l) => l.voltas ?? MUTED, className: "ta-c" },
    { key: "min", label: "Mínimo", title: "Cumpriu o mínimo de voltas do ranking", sort: (l) => (l.minimo ? 0 : 1), cell: (l) => (l.minimo ? "✓" : MUTED), className: "ta-c" },
    { key: "media", label: "Média", title: "Média de (gross − CR) das voltas que contam — mais baixa = melhor", sort: (l) => l.media, firstDir: "asc", cell: (l) => fmt1(l.media), className: "ta-c mono" },
  ];

  return (
    <RankingListaView
      titulo="🏆 Ranking juvenil — Itália"
      sub="Ranking nazionale giovanile da Federgolf · média de (gross − CR) · clique num jogador para ver as voltas"
      site={RANKING_SITE} siteLabel="🔗 federgolf.it"
      anos={anos} ano={anoSel} onAno={setAno}
      listas={FG_RANKING_CATS.map((c) => ({ key: c.cod, label: `${c.nome} · ${c.escalao}`, count: r.anos[anoSel]?.[`${sexo}-${c.cod}`]?.length }))}
      lista={cat} onLista={setCat}
      sexo={sexo} onSexo={setSexo}
      rows={r.anos[anoSel]?.[`${sexo}-${cat}`] ?? []}
      cols={cols}
      rowKey={(l) => l.id ?? l.nome}
      pesquisa={(l) => `${l.nome} ${l.clube ?? ""}`}
      rowTitle="Ver as voltas deste jogador"
      onRowClick={(l) => { if (l.id) navigate(`/fig/jogador/${l.id}?ano=${anoSel}`); }}
    />
  );
}

/* ── Ficha do jogador (voltas do ranking) ──────────────────────────── */

export function FgJogadorView({ id, ano }: { id: string; ano?: string | null }) {
  const { r, erro } = useFgRanking();
  const [voltas, setVoltas] = useState<FgRankingVolta[] | null>(null);
  const entradas = useMemo(() => (r ? fgRankingDoJogador(r, id) : []), [r, id]);
  const anoSel = ano && entradas.some((e) => e.ano === ano) ? ano : entradas[0]?.ano;
  useEffect(() => {
    let alive = true;
    setVoltas(null);
    if (!anoSel) return;
    loadFgRankingVoltas()
      .then((d) => { if (alive) setVoltas(d?.anos?.[anoSel]?.[id] ?? []); })
      .catch(() => { if (alive) setVoltas([]); });
    return () => { alive = false; };
  }, [id, anoSel]);

  if (erro) return <ErrorState message="Erro ao carregar o ranking juvenil" detail={erro} />;
  if (!r) return <LoadingState message="A carregar o jogador…" />;
  const e = entradas.find((x) => x.ano === anoSel);
  if (!e) return <RankingDetail backTo="/fig/info/ranking" notFound="Este jogador não está no ranking juvenil da Federgolf." />;

  const cols: RankingCol<FgRankingVolta>[] = [
    { key: "data", label: "Data", sort: (v) => v[1], firstDir: "desc", cell: (v) => (v[1] ? fmtDatePt(v[1]) : MUTED) },
    { key: "prova", label: "Prova", sort: (v) => v[0], firstDir: "asc", cell: (v) => fgTitulo(v[0]) },
    { key: "clube", label: "Campo", sort: (v) => v[2], firstDir: "asc", cell: (v) => fgClube(v[2]) || MUTED },
    { key: "volta", label: "Volta", cell: (v) => (v[3] != null ? `R${v[3]}` : MUTED), className: "ta-c" },
    { key: "gross", label: "Gross", sort: (v) => v[4], firstDir: "asc", cell: (v) => v[4] ?? MUTED, className: "ta-c" },
    { key: "par", label: "Par", cell: (v) => v[5] ?? MUTED, className: "ta-c" },
    { key: "cr", label: "CR", cell: (v) => fmt1(v[6]), className: "ta-c mono" },
    { key: "score", label: "Gross − CR", title: "O valor que conta para a média do ranking", sort: (v) => v[7], firstDir: "asc", cell: (v) => fmt1(v[7]), className: "ta-c mono" },
  ];

  return (
    <RankingDetail
      backTo="/fig/info/ranking"
      header={<>
        <h2 className="m-0">{fgNome(e.nome)}</h2>
        <EscPill esc={escalaoCanon(e.categoria, "it") ?? e.categoria} />
        <span className="muted">{fgClube(e.clube)}</span>
      </>}
      stats={[
        { label: `Ranking ${e.ano}`, value: `${fmtOrd(e.pos)} de ${e.de}`, title: `${e.categoria} ${e.sexo === "F" ? "femininas" : "masculinos"}` },
        { label: "Idade", value: e.idade ?? "—" },
        { label: "Média (gross − CR)", value: e.media != null ? e.media.toFixed(2) : "—" },
        { label: "Voltas", value: `${e.voltas ?? "—"}${e.minimo ? " ✓" : ""}`, title: e.minimo ? "Cumpriu o mínimo de voltas" : "Ainda sem o mínimo de voltas" },
        { label: "Qual.", value: e.qual || "—" },
        // Um jogador aparece em várias categorias do mesmo ano (joga acima da idade).
        ...entradas.filter((x) => x !== e).map((x) => ({ label: `Ranking ${x.ano} · ${x.categoria}`, value: `${fmtOrd(x.pos)} de ${x.de}` })),
      ]}
      eventsTitle={`Voltas de ${e.ano}`}
      events={voltas}
      emptyMessage="Sem voltas registadas neste ano."
    >
      {voltas && <RankingTable rows={voltas} cols={cols} rowKey={(v) => `${v[1]}|${v[0]}|${v[3]}`} defaultSort="data" defaultDir="desc" />}
    </RankingDetail>
  );
}
