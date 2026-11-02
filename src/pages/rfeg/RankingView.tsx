/**
 * RankingView.tsx — «🏆 Ranking juvenil» da /rfeg (menu ⓘ Info): as listas
 * da RFEG (nacionais e por zona) com a peça comum RankingListaView, a mesma da
 * /fig. Dados: scripts/scrape-rfeg-ranking.js (ver docs/claude/ffg-rfeg.md).
 */
import { useEffect, useMemo, useState } from "react";
import RankingListaView from "../../ui/ranking/RankingListaView";
import LoadingState from "../../ui/LoadingState";
import ErrorState from "../../ui/ErrorState";
import { EscPill } from "../../ui/PillBadge";
import { MUTED } from "../../ui/tableCells";
import { nameCell, type RankingCol } from "../../ui/ranking/RankingPage";
import { titleCase } from "../../utils/format";
import {
  loadRfegRanking, loadRfegRankingsIndex, rfegRankingEscalao, rfegRankingsDoAno,
  type RfegRankingIndex, type RfegRankingJogador, type RfegRankingLista,
} from "../../data/rfeg/rankings";

const RANKINGS_SITE = "https://rfegolf.es/competiciones/rankings-golf";

/** Os nacionais escrevem «APELLIDOS, NOMBRE»; as zonas «NOMBRE APELLIDOS». */
const nomeJogador = (s: string) => titleCase(s.includes(",") ? s.split(",").map((x) => x.trim()).reverse().join(" ") : s);

const COLS: RankingCol<RfegRankingJogador>[] = [
  { key: "pos", label: "#", sort: (j) => j.pos ?? 1e9, firstDir: "asc", cell: (j) => j.pos ?? MUTED, className: "ta-c" },
  { key: "nome", label: "Jogador", sort: (j) => j.nombre, firstDir: "asc", cell: (j) => nameCell(nomeJogador(j.nombre)) },
  { key: "lic", label: "Licença", sort: (j) => j.licencia ?? "", firstDir: "asc", cell: (j) => j.licencia || MUTED, className: "mono" },
  { key: "cat", label: "Escalão", sort: (j) => j.cat ?? "", cell: (j) => { const e = rfegRankingEscalao(j.cat); return e ? <EscPill esc={e} /> : MUTED; } },
  { key: "idade", label: "Idade", sort: (j) => j.edad ?? 99, firstDir: "asc", cell: (j) => j.edad ?? MUTED, className: "ta-c" },
  { key: "pts", label: "Pontos", sort: (j) => -(j.puntos ?? -1e9), firstDir: "asc", cell: (j) => j.puntos ?? MUTED, className: "ta-c mono" },
];

export function RFEGRankingView() {
  const [idx, setIdx] = useState<RfegRankingIndex | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ano, setAno] = useState("");
  const [file, setFile] = useState("");
  // A lista carregada e o ficheiro de onde veio (o JSON não traz o próprio nome).
  const [lista, setLista] = useState<{ file: string; data: RfegRankingLista } | null>(null);

  useEffect(() => {
    let alive = true;
    loadRfegRankingsIndex().then((d) => { if (alive) setIdx(d); }).catch((e) => { if (alive) setErro(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);
  const anos = useMemo(() => (idx ? [...new Set(idx.rankings.map((r) => String(r.year)))].sort().reverse() : []), [idx]);
  const anoSel = ano || anos[0] || "";
  const listas = useMemo(() => (idx && anoSel ? rfegRankingsDoAno(idx, Number(anoSel)) : []), [idx, anoSel]);
  const fileSel = listas.some((l) => l.file === file) ? file : listas[0]?.file ?? "";

  useEffect(() => {
    let alive = true;
    setLista(null);
    if (!fileSel) return;
    loadRfegRanking(fileSel).then((d) => { if (alive && d) setLista({ file: fileSel, data: d }); }).catch((e) => { if (alive) setErro(String(e?.message || e)); });
    return () => { alive = false; };
  }, [fileSel]);

  if (erro) return <ErrorState message="Erro ao carregar os rankings da RFEG" detail={erro} />;
  if (!idx) return <LoadingState message="A carregar os rankings da RFEG…" />;
  const item = listas.find((l) => l.file === fileSel);

  return (
    <RankingListaView
      titulo="🏆 Ranking juvenil — España"
      sub="Rankings juvenis da RFEG (nacionais e por zona) · pontos por resultados"
      site={RANKINGS_SITE} siteLabel="🔗 rfegolf.es"
      anos={anos} ano={anoSel} onAno={(a) => { setAno(a); setFile(""); }}
      // Os nacionais vêm em maiúsculas; os das zonas já vêm bem escritos.
      listas={listas.map((l) => ({ key: l.file, label: l.titulo === l.titulo.toUpperCase() ? titleCase(l.titulo) : l.titulo, count: l.total }))}
      lista={fileSel} onLista={setFile}
      rows={lista?.file === fileSel ? lista.data.players : []}
      cols={COLS}
      rowKey={(j) => j.licencia || `${j.pos}|${j.nombre}`}
      pesquisa={(j) => `${j.nombre} ${j.licencia ?? ""}`}
      nota={item ? <>Lista de {item.fecha ?? "—"} · {item.total} jogadores{lista?.data.pdf ? <> · PDF oficial em rfegolf.es</> : null}</> : null}
    />
  );
}
