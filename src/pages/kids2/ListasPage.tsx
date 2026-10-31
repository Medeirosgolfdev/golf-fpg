/**
 * kids2/ListasPage.tsx — /kids2/listas
 *
 * Listas de inscritos (Entry Lists) com o handicap de cada miúdo à data da
 * lista, e o link para a ficha do kids2 de quem já tem ficha. Os dados saem do
 * agregador (scripts/aggregator/util/hcp-listas.js → hcp-listas-ligacoes.json).
 */
import TabRow from "../../ui/TabRow";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cachedFetchJson } from "../../data/fetchCache";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { isManuel, MANUEL_FED } from "../../constants/manuel";
import AdmissionsTab, { type AdmissionsExtraCol } from "../../ui/AdmissionsTab";
import type { FpgAdmissions, FpgAdmissionPlayer } from "../../data/nacional2026Loader";
import Kids2SubNav from "./Kids2SubNav";

interface Inscrito {
  ordem: number; pos: number; lista: "entry" | "waiting" | null;
  name: string; country: string; hcp: number;
  junior: { id: string; name: string; dob: string | null; club: string | null; via: string } | null;
  ambiguo: string[] | null;
  duplicadoDe?: number | null;
  hcpAtual: { valor: number; fonte: string; data: string | null } | null;
  anterior?: Anterior | null;
}
/** Resultado na edição anterior do mesmo torneio (posição no seu sexo, por pancadas). */
interface Anterior { pos: number | null; empate: boolean; de: number; gross: number | null; hcp: number | null; }
interface CandidatoPt {
  rank: number; fed: string; name: string; club: string | null; dob: string | null; hcp: number;
  juniorId: string | null;
  inscrito: { lista: "entry" | "waiting" | null; pos: number; hcp: number } | null;
  anterior?: Anterior | null;
}
interface Lista {
  id: string; label: string; torneio: string | null; data: string; sexo?: "M" | "F" | null;
  nascidosDesde: number | null; wildcardsFpg: number | null; players: Inscrito[];
  candidatosPt?: CandidatoPt[] | null;
  edicaoAnterior?: { label: string; torneio: string; total: number; vencedor: { name: string; gross: number } } | null;
}

/** Célula «2025»: posição (T = empatado) de N, ou «não acabou»; «—» se não jogou. */
function CelAnterior({ a, ano }: { a: Anterior | null | undefined; ano: string }) {
  if (!a) return <span className="p-muted">—</span>;
  if (a.pos == null) return <span className="fs-11 p-muted" title={`Jogou em ${ano} mas não acabou`}>não acabou</span>;
  return <span title={`${ano}: ${a.empate ? "empatado em " : ""}${a.pos}.º de ${a.de}${a.hcp != null ? ` · handicap ${fmtHcp(a.hcp)}` : ""}`}>
    <b>{a.empate ? "T" : ""}{a.pos}.º</b> <span className="fs-11 p-muted">/{a.de}</span>
  </span>;
}
const posAnt = (a: Anterior | null | undefined) => (a?.pos ?? (a ? 900 : 999));
const nomeLista = (l: Lista) => (l.sexo === "M" ? "Rapazes" : l.sexo === "F" ? "Raparigas" : l.label);

/** Handicap à maneira das listas: «+» para os de handicap positivo (guardados em negativo). */
const fmtHcp = (h: number | null | undefined) => (h == null ? "—" : h < 0 ? `+${(-h).toFixed(1)}` : h.toFixed(1));
const ddmmaa = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");

/** A lista de inscritos na tabela de inscrições partilhada (AdmissionsTab —
 *  23/10/2026, fase 3 do plano), com as colunas próprias das listas: HCP à
 *  data da lista, HCP actual e a edição anterior. Entrada/espera ficam no # e
 *  no Status; repetidos no PDF, fichas ambíguas e sem ficha em etiquetas. */
function TabelaLista({ lista }: { lista: Lista }) {
  const ant = lista.edicaoAnterior ?? null;
  // Cada inscrito no formato FPG; o original fica à mão pelas colunas extra,
  // pela lista + posição + nome (a AdmissionsTab trabalha sobre cópias).
  const chave = (status: string, pos: number | null, nome: string) => `${status}|${pos}|${nome}`;
  const { admissions, porJog } = useMemo(() => {
    const porJog = new Map<string, Inscrito>();
    const players = [...lista.players].sort((a, b) => a.ordem - b.ordem).map((p): FpgAdmissionPlayer => {
      const eu = isManuel({ name: p.name, memberId: p.junior?.id?.replace(/^u/, "") });
      const nota = p.duplicadoDe ? `repetida no PDF (igual à ${p.duplicadoDe})` : p.junior ? null : p.ambiguo ? "ficha ambígua" : "sem ficha";
      const a: FpgAdmissionPlayer = {
        pos: p.pos, fed: eu ? MANUEL_FED : null, nome: p.name, clube: p.junior?.club ?? null,
        hcp: p.hcp, vac: null, dataInscricao: null,
        status: p.lista === "waiting" ? "reserva" : "confirmed",
        dob: p.junior?.dob ?? null, country: p.country, juniorId: p.junior?.id ?? null,
        tags: nota ? [nota] : undefined,
      };
      porJog.set(chave(a.status, a.pos, a.nome), p);
      return a;
    });
    const admissions: FpgAdmissions = { name: lista.label, date: lista.data, players };
    return { admissions, porJog };
  }, [lista]);
  const extraCols = useMemo<AdmissionsExtraCol[]>(() => {
    const I = (a: FpgAdmissionPlayer) => porJog.get(chave(a.status, a.pos, a.nome));
    const cols: AdmissionsExtraCol[] = [
      // País por extenso, como a tabela antiga (a bandeira está no nome).
      { key: "pais", label: "País", sort: a => a.country ?? null,
        cell: a => <span className="u-ws-nowrap">{a.country || "—"}</span> },
      { key: "atual", label: "HCP actual", title: "Handicap mais recente na ficha (FPG, RFEG ou FFG)",
        sort: a => I(a)?.hcpAtual?.valor ?? null,
        cell: a => { const h = I(a)?.hcpAtual;
          return h ? <span title={`${h.fonte}${h.data ? " · " + h.data : ""}`}>{fmtHcp(h.valor)} <span className="fs-11 p-muted">{h.fonte}</span></span> : "—"; } },
    ];
    if (ant) cols.push(
      { key: "ant", label: ant.label, title: `Posição em ${ant.torneio}, no seu sexo, pelas pancadas`,
        sort: a => posAnt(I(a)?.anterior), cell: a => <CelAnterior a={I(a)?.anterior} ano={ant.label} /> },
      { key: "antg", label: `Pancadas ${ant.label}`, title: `Pancadas nas 3 voltas de ${ant.label}`,
        sort: a => I(a)?.anterior?.gross ?? null, cell: a => I(a)?.anterior?.gross ?? "—" },
    );
    return cols;
  }, [porJog, ant]);
  const posContent = useMemo(() => (a: FpgAdmissionPlayer) => (
    <span className={`p p-sm ${a.status === "reserva" ? "p-muted" : "p-tourn"}`} title={a.status === "reserva" ? "Lista de espera" : "Na lista"}>
      {a.status === "reserva" ? "Espera" : "Lista"} {a.pos}
    </span>
  ), []);

  const nEntry = lista.players.filter(p => p.lista === "entry" && !p.duplicadoDe).length;
  const nWait = lista.players.filter(p => p.lista === "waiting" && !p.duplicadoDe).length;
  const nRep = lista.players.filter(p => p.duplicadoDe).length;
  const nFicha = lista.players.filter(p => p.junior).length;
  const nRepet = lista.players.filter(p => p.anterior).length;

  return (
    <section className="u-mb-24px">
      <h2 className="u-m-0-0-4px u-fs-fs-16 u-fw-600 u-c-text">{lista.torneio ?? lista.label}</h2>
      <div className="u-fs-fs-12 u-c-text-3 u-mb-10px u-lh-1_5">
        {lista.label} · {nEntry} na lista{lista.wildcardsFpg ? ` (+ ${lista.wildcardsFpg} wild cards da FPG por nomear)` : ""}{nRep ? ` · ${nRep} nome(s) repetido(s) no PDF` : ""} · {nWait} em lista de espera
        {lista.nascidosDesde ? ` · nascidos em ${lista.nascidosDesde} ou depois` : ""} · {nFicha} com ficha no kids2
        {ant ? ` · ${nRepet} já jogaram em ${ant.label} (venceu ${ant.vencedor.name}, ${ant.vencedor.gross})` : ""}
        {" · "}HCP = handicap na lista ({ddmmaa(lista.data)})
      </div>
      <AdmissionsTab admissions={admissions} date={lista.data} hideCols={LISTA_HIDE}
        extraCols={extraCols} posContent={posContent} reservaLabel="lista de espera" recentHours={null} />
    </section>
  );
}
const LISTA_HIDE = { fed: true, tee: true, vac: true, registo: true };

/** Portugueses que a FPG pode nomear (wild cards), por handicap, com a linha dos N lugares. */
function TabelaCandidatos({ lista }: { lista: Lista }) {
  const cands = lista.candidatosPt ?? [];
  const { sortKey, sortDir, toggleSort } = useSort<string>("rank", "asc", { hcp: "asc" });
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...cands].sort((a, b) => {
      switch (sortKey) {
        case "name": return dir * a.name.localeCompare(b.name);
        case "dob": return dir * (a.dob || "9999").localeCompare(b.dob || "9999") || a.rank - b.rank;
        case "club": return dir * (a.club || "~").localeCompare(b.club || "~") || a.rank - b.rank;
        case "inscrito": return dir * ((a.inscrito ? 0 : 1) - (b.inscrito ? 0 : 1)) || a.rank - b.rank;
        case "ant": return dir * (posAnt(a.anterior) - posAnt(b.anterior)) || a.rank - b.rank;
        case "antg": return dir * ((a.anterior?.gross ?? 999) - (b.anterior?.gross ?? 999)) || a.rank - b.rank;
        default: return dir * (a.rank - b.rank);
      }
    });
  }, [cands, sortKey, sortDir]);
  if (!cands.length) return null;
  const n = lista.wildcardsFpg ?? 0;
  const porOrdem = sortKey === "rank" && sortDir === "asc";
  const ant = lista.edicaoAnterior ?? null;
  return (
    <section className="u-mb-24px">
      <h2 className="u-m-0-0-4px u-fs-fs-16 u-fw-600 u-c-text">
        🇵🇹 {lista.sexo === "F" ? "Portuguesas" : "Portugueses"} que podem ser wild card
      </h2>
      <div className="u-fs-fs-12 u-c-text-3 u-mb-10px u-lh-1_5">
        A FPG nomeia {n} «at its own discretion», sem critério escrito. Aqui: federados de nacionalidade portuguesa,
        {lista.sexo === "F" ? " raparigas" : " rapazes"}, nascidos em {lista.nascidosDesde} ou depois, por handicap de hoje
        (os {cands.length} primeiros). A linha marca os {n} primeiros.
      </div>
      <div className="u-ox-auto">
        <table className="player-list-table u-fvn-tabular-nums">
          <thead>
            <tr>
              <SortableHdr k="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Ordem por handicap">#</SortableHdr>
              <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "left" }}>Jogador</SortableHdr>
              <SortableHdr k="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Nasc.</SortableHdr>
              <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "left" }}>Clube</SortableHdr>
              <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Handicap de hoje (FPG)">HCP</SortableHdr>
              <SortableHdr k="inscrito" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title="Se já está na Entry List">Inscrito</SortableHdr>
              {ant && <>
                <SortableHdr k="ant" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title={`Posição em ${ant.torneio}, no seu sexo, pelas pancadas`}>{ant.label}</SortableHdr>
                <SortableHdr k="antg" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title={`Pancadas nas 3 voltas de ${ant.label}`}>Pancadas {ant.label}</SortableHdr>
              </>}
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const eu = isManuel({ name: c.name, fed: c.fed });
              const linha = porOrdem && c.rank === n;
              return (
                <tr key={c.fed} className={eu ? "row-manuel" : undefined}
                  style={linha ? { borderBottom: "3px solid var(--accent)" } : undefined}>
                  <td className="u-ta-center u-fw-700">{c.rank}</td>
                  <td style={{ textAlign: "left", fontWeight: eu ? 700 : undefined }}>
                    {c.juniorId ? <Link to={`/kids2/${c.juniorId}`}>{c.name}</Link> : c.name}
                  </td>
                  <td className="u-ta-center">{c.dob ? c.dob.slice(0, 4) : "—"}</td>
                  <td className="fs-12 u-ta-left">{c.club ?? "—"}</td>
                  <td className="u-ta-center u-fw-700">{fmtHcp(c.hcp)}</td>
                  <td className="u-ta-center u-ws-nowrap">
                    {c.inscrito
                      ? <span className={`p p-sm ${c.inscrito.lista === "waiting" ? "p-muted" : "p-tourn"}`} title={`Inscrito com ${fmtHcp(c.inscrito.hcp)}`}>
                          {c.inscrito.lista === "waiting" ? "Espera" : "Lista"} {c.inscrito.pos}
                        </span>
                      : <span className="fs-11 p-muted">não inscrito</span>}
                  </td>
                  {ant && <>
                    <td className="u-ta-center u-ws-nowrap"><CelAnterior a={c.anterior} ano={ant.label} /></td>
                    <td className="u-ta-center">{c.anterior?.gross ?? "—"}</td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ListasPage() {
  const [data, setData] = useState<{ listas: Lista[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    cachedFetchJson<{ listas: Lista[] }>("/data/hcp-listas-ligacoes.json").then(setData).catch(e => setErr(String(e)));
  }, []);

  // Rapazes primeiro, depois raparigas; listas sem sexo pela data (mais recente primeiro).
  const listas = useMemo(() => [...(data?.listas ?? [])].sort((a, b) =>
    (a.sexo === "M" ? 0 : a.sexo === "F" ? 1 : 2) - (b.sexo === "M" ? 0 : b.sexo === "F" ? 1 : 2) || b.data.localeCompare(a.data)), [data]);
  // Torneio + escalão (14/10/2026): os botões diziam só «Rapazes/Raparigas»
  // e não se sabia de que torneio era cada lista. Agrupa-se pelo torneio (o
  // texto antes de « — ») e o escalão é o resto.
  const partes = (l: Lista) => {
    const t = l.torneio ?? l.label;
    const i = t.lastIndexOf(" — ");
    return i > 0 ? { torneio: t.slice(0, i), div: t.slice(i + 3) } : { torneio: t, div: nomeLista(l) };
  };
  const grupos = useMemo(() => {
    const m = new Map<string, { torneio: string; data: string; listas: Lista[] }>();
    for (const l of listas) {
      const { torneio } = partes(l);
      const g = m.get(torneio) ?? { torneio, data: l.data, listas: [] };
      g.listas.push(l);
      if (l.data > g.data) g.data = l.data;
      m.set(torneio, g);
    }
    return [...m.values()].sort((a, b) => b.data.localeCompare(a.data) || a.torneio.localeCompare(b.torneio));
  }, [listas]);
  const atual = listas.find(l => l.id === sel) ?? grupos[0]?.listas[0];
  const grupoAtual = atual ? grupos.find(g => g.listas.includes(atual)) : undefined;

  return (
    <>
      <Kids2SubNav />
      <div className="u-p-16px-20px">
        <div className="u-d-flex u-ai-center u-gap-12px u-fwr-wrap u-mb-12px">
          <h1 className="u-m-0 u-fs-fs-18 u-fw-600 u-c-text">📝 Listas de inscritos</h1>
          {grupos.length > 1 && (
            <select className="select u-maxw-520px" value={grupoAtual?.torneio ?? ""} aria-label="Torneio"
              onChange={(e) => setSel(grupos.find(g => g.torneio === e.target.value)?.listas[0]?.id ?? null)}
>
              {grupos.map(g => <option key={g.torneio} value={g.torneio}>{g.torneio}</option>)}
            </select>
          )}
          {grupoAtual && grupoAtual.listas.length > 1 && (
            <TabRow active={atual?.id ?? ""} onChange={(k) => setSel(k)}
              tabs={grupoAtual.listas.map(l => ({ key: l.id, label: partes(l).div }))} />
          )}
        </div>
        {err ? <EmptyState size="md" message={"Falhou: " + err} />
          : !data ? <LoadingState message="A carregar listas…" />
            : !atual ? <EmptyState size="md" message="Ainda não há listas de inscritos." />
              : <>
                  <TabelaLista key={atual.id} lista={atual} />
                  <TabelaCandidatos key={"c" + atual.id} lista={atual} />
                </>}
      </div>
    </>
  );
}
