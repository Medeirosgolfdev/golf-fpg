/**
 * src/pages/DrawsPage.tsx
 *
 * Página dedicada de Draws/Pairings do Manuel — lista de jogadores com quem
 * já foi parelhado em torneios FPG e USKids, com cruzamento de scores.
 *
 * Vertentes (tabs):
 *   - FPG          → pairings de torneios portugueses (fpg-admissions-draws)
 *   - USKids       → pairings de torneios USKids (uskids-draws, 5 torneios)
 *   - Internacional → placeholder; a preencher manualmente a partir de fotografias
 *                     (WJGC/EOWAGR/Doral/England/Espanha/França não publicam pairings)
 *
 * Fonte de dados: public/data/manuel-pairings.json (gerado por
 * scripts/pairings-build.js — cruza FPG draws + USKids draws + overrides
 * manuais (Intl WJGC/Doral/EU WAGR e USKids IE) + sintetiza R3 pelo
 * acumulado quando o draw oficial não foi publicado).
 *
 * Display: 1 linha por jogador único (agregado por fed ou nome+país). Click
 * expande para ver cada ronda jogada em conjunto, com score do Manuel vs
 * score do companheiro nessa ronda.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import KpiCard from "../ui/KpiCard";
import { EscPill, PILL_ROUND } from "../ui/PillBadge";
import { FLAG } from "../utils/flagUtils";
import { norm, escalaoAtDate, displayName } from "../utils/format";
import { MANUEL_FED } from "../constants/manuel";
import { loadPlayers } from "../data/loader";
import { cachedFetchJson } from "../data/fetchCache";
import type { PlayersDb } from "../data/types";

// ── Tipos ─────────────────────────────────────────────────────────────

type Score = { gross: number; toPar: number | null } | null;

interface Companion {
  nome: string;
  fed: string | null;
  clube: string | null;
  pais: string | null;
  score: Score;
}

interface Round {
  circuito: "FPG" | "USKids" | "Intl";
  torneioId: string;
  torneioNome: string;
  data: string | null;
  ronda: number;
  teeTime: string | null;
  startHole: number | null;
  campo: string | null;
  manuelScore: Score;
  companheiros: Companion[];
}

interface TorneioEntry {
  torneioId: string;
  nome: string;
  data: string | null;
  rondas: number;
}

interface CoverageBlock {
  rondasJogadas: number;
  rondasComDraw: number;
  torneiosJogados: number;
  torneiosComDraw: number;
  torneiosSemDraw?: string[];
  torneiosComDrawDetalhe?: TorneioEntry[];
  torneiosSemDrawDetalhe?: TorneioEntry[];
  torneiosSkippedDetalhe?: TorneioEntry[];
  skipCcodes?: string[];
}

interface PairingsFile {
  geradoEm: string;
  manuelFed: string;
  manuelUskidsIds: string[];
  totalRondas: number;
  totalCompanheirosUnicos: number;
  cobertura?: { fpg: CoverageBlock; uskids: CoverageBlock };
  rondas: Round[];
}

// Linha agregada da tabela principal (1 por companheiro único)
interface CompanionRow {
  key: string;
  nome: string;
  fed: string | null;
  clube: string | null;
  pais: string | null;
  dob: string | null;
  escalao: string | null;
  vezes: number;
  ultimaData: string | null;
  primeiraData: string | null;
  circuitos: Set<"FPG" | "USKids" | "Intl">;
  rondas: Array<{
    data: string | null;
    torneioNome: string;
    torneioId: string;
    ronda: number;
    circuito: "FPG" | "USKids" | "Intl";
    manuelScore: Score;
    companheiroScore: Score;
  }>;
}

// Tabs do UI: FPG (portugueses) vs Intl (USKids + Bluegolf/GolfGenius/etc.)
type Tab = "FPG" | "Intl";
type SortKey = "nome" | "escalao" | "clube" | "vezes" | "ultima";

// Link externo para tee times num site que não expõe API (Bluegolf/GolfGenius)
interface IntlLink {
  circuito: string;
  torneioId: string;
  nome: string;
  url: string;
  ronda: number | string;
  fonte: string;
  notas?: string;
}
interface IntlLinksFile {
  ultimaAtualizacao?: string;
  links: IntlLink[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmtToPar(v: number | null | undefined): string {
  if (v == null) return "";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

function fmtScore(s: Score): string {
  if (!s) return "—";
  const tp = s.toPar != null ? ` (${fmtToPar(s.toPar)})` : "";
  return `${s.gross}${tp}`;
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  // YYYY-MM-DD → DD/MM/YYYY
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ── Resolução de identidade dos companheiros ──────────────────────────
// Os dados de draws trazem por vezes o nome invertido ("Apelido,Nome"), em
// MAIÚSCULAS, ou abreviado ("M.Medeiros" nos torneios de pares) e sem licença.
// Isto rebenta a deduplicação (o pai aparecia 2×) e impede o escalão. Aqui
// resolvemos cada companheiro para uma identidade canónica (fed + nome + dob)
// usando o players.json + federados-inativos-jovens.json carregados em runtime.

interface PlayerLite { fed: string; name: string; dob: string | null; clubNorm?: string }
interface Lookups {
  dobByFed: Map<string, string>;          // fed → dob (players + inativos + federados)
  byNorm: Map<string, PlayerLite>;        // nome exacto (players + inativos + federados únicos)
  byISsmall: Map<string, PlayerLite[]>;   // "inicial|apelido" só players+inativos → resolve o pai
  byISfed: Map<string, PlayerLite[]>;     // "inicial|apelido" nos federados (c/ clube p/ scoping)
}

// "Apelido,Nome" → "Nome Apelido" (só quando há exactamente uma vírgula)
function flipComma(nome: string): string {
  const parts = nome.split(",");
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return `${parts[1].trim()} ${parts[0].trim()}`;
  }
  return nome.trim();
}

// Um clube de companheiro ("Santo da Serra") casa com o clube de um federado?
function clubMatch(compClube: string | null, clubNorm?: string): boolean {
  const cc = norm(compClube || "");
  if (!cc || !clubNorm) return false;
  return clubNorm.includes(cc);
}

// Resolve um companheiro para { fed, nome, dob } canónicos.
function resolveCompanion(c: Companion, lk: Lookups): { fed: string | null; nome: string; dob: string | null } {
  const nome = displayName(flipComma(c.nome));
  // 1) já tem licença → manter o nome (já corrigido) e buscar dob da BD
  if (c.fed) {
    return { fed: c.fed, nome, dob: lk.dobByFed.get(c.fed) || null };
  }
  // 2) match exacto por nome → adopta identidade da BD
  const exact = lk.byNorm.get(norm(nome));
  if (exact) return { fed: exact.fed, nome: exact.name, dob: exact.dob };
  // 3) abreviatura "I.Apelido"
  const m = nome.match(/^([A-Za-zÀ-ÿ])\.\s*(.+)$/);
  if (m) {
    const key = `${norm(m[1])}|${norm(m[2].split(/\s+/).pop() || "")}`;
    // 3a) índice pequeno (players+inativos): resolve o pai sem ambiguidade
    const small = (lk.byISsmall.get(key) || []).filter(p => p.fed !== MANUEL_FED);
    if (small.length === 1) return { fed: small[0].fed, nome: small[0].name, dob: small[0].dob };
    // 3b) federados, com scoping pelo clube do companheiro (desambigua nos torneios de pares)
    const fedC = (lk.byISfed.get(key) || []).filter(p => p.fed !== MANUEL_FED && clubMatch(c.clube, p.clubNorm));
    if (fedC.length === 1) return { fed: fedC[0].fed, nome: fedC[0].name, dob: fedC[0].dob };
  }
  return { fed: null, nome, dob: null };
}

// Escalão manual para jogadores sem licença/dob para resolver automaticamente
// (ex: emigrantes que jogam no verão). Chave = nome normalizado.
const MANUAL_ESCALAO: Record<string, string> = {
  "valentin bonnet": "Sub 12",
};

// Ordem dos escalões (para ordenação da coluna)
const ESC_ORDER = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18", "Sub 21", "Sub 24", "Absoluto", "Sénior", "Super Sénior"];
function escRank(esc: string | null): number {
  if (!esc) return 99;
  const i = ESC_ORDER.indexOf(esc);
  return i === -1 ? 98 : i;
}

// Pill de ronda — usa as cores globais do projecto (PILL_ROUND: 2R cyan, 3R
// vermelho, 4R violeta). Rondas sem cor global (R1) ficam neutras.
function RondaPill({ n }: { n: number }) {
  const style = PILL_ROUND[n];
  return (
    <span
      className="p p-sm p-tourn"
      style={style ?? { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "transparent" }}
    >
      R{n}
    </span>
  );
}

// Medalha para os 3 companheiros com mais rondas em conjunto
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Resultado do Manuel face ao companheiro numa ronda (cor do ponto)
function h2hDot(manuel: Score, comp: Score): { res: "W" | "D" | "L"; color: string; title: string } | null {
  if (!manuel || !comp) return null;
  const a = manuel.toPar ?? manuel.gross;
  const b = comp.toPar ?? comp.gross;
  if (a == null || b == null) return null;
  if (a < b) return { res: "W", color: "var(--color-good)", title: "Manuel melhor nesta ronda" };
  if (a > b) return { res: "L", color: "var(--color-danger)", title: "Companheiro melhor nesta ronda" };
  return { res: "D", color: "var(--text-muted)", title: "Empate nesta ronda" };
}

// Registo do Manuel face a um companheiro (só rondas com ambos os scores)
function h2hRecord(rondas: CompanionRow["rondas"]): { w: number; d: number; l: number; played: number } {
  let w = 0, d = 0, l = 0;
  for (const r of rondas) {
    const dot = h2hDot(r.manuelScore, r.companheiroScore);
    if (!dot) continue;
    if (dot.res === "W") w++;
    else if (dot.res === "L") l++;
    else d++;
  }
  return { w, d, l, played: w + d + l };
}

// Agregação: percorre as rondas e produz 1 linha por companheiro único.
// `lk` resolve identidade (fed/nome/dob) antes de chavear → o pai deixa de
// aparecer 2× e os nomes invertidos/abreviados são corrigidos.
function aggregateCompanions(rondas: Round[], lk: Lookups): CompanionRow[] {
  const map = new Map<string, CompanionRow>();
  for (const r of rondas) {
    for (const c of r.companheiros) {
      const res = resolveCompanion(c, lk);
      const k = res.fed ? `fed:${res.fed}` : `name:${norm(res.nome)}|${c.pais || ""}`;
      let row = map.get(k);
      if (!row) {
        row = {
          key: k,
          nome: res.nome,
          fed: res.fed,
          clube: c.clube,
          pais: c.pais,
          dob: res.dob,
          escalao: null,
          vezes: 0,
          ultimaData: null,
          primeiraData: null,
          circuitos: new Set([r.circuito]),
          rondas: [],
        };
        map.set(k, row);
      }
      // actualizar campos (preferir valores não-null)
      if (!row.clube && c.clube) row.clube = c.clube;
      if (!row.pais && c.pais) row.pais = c.pais;
      if (!row.fed && res.fed) row.fed = res.fed;
      if (!row.dob && res.dob) row.dob = res.dob;
      row.vezes += 1;
      if (r.data) {
        if (!row.ultimaData || r.data > row.ultimaData) row.ultimaData = r.data;
        if (!row.primeiraData || r.data < row.primeiraData) row.primeiraData = r.data;
      }
      // acumular circuitos originais (FPG/USKids/Intl) para mostrar 1 badge por cada
      row.circuitos.add(r.circuito);
      row.rondas.push({
        data: r.data,
        torneioNome: r.torneioNome,
        torneioId: r.torneioId,
        ronda: r.ronda,
        circuito: r.circuito,
        manuelScore: r.manuelScore,
        companheiroScore: c.score,
      });
    }
  }
  // ordenar rondas internas por data desc + calcular escalão à data do último encontro
  for (const row of map.values()) {
    row.rondas.sort((a, b) => {
      const da = a.data || "0000-00-00";
      const db = b.data || "0000-00-00";
      if (da !== db) return db.localeCompare(da);
      return a.ronda - b.ronda;
    });
    row.escalao = escalaoAtDate(row.dob, row.ultimaData) || MANUAL_ESCALAO[norm(row.nome)] || null;
  }
  return [...map.values()];
}

// ── Componentes auxiliares ────────────────────────────────────────────

function CompanionNameLink({ row }: { row: CompanionRow }) {
  // FPG → link para /jogadores/{fed}
  if (row.fed) {
    return (
      <Link to={`/jogadores/${row.fed}`} className="tourn-pname tourn-pname-link">
        {row.nome}
      </Link>
    );
  }
  // USKids/Intl → link para /kids2#{nome}
  return (
    <Link to={`/kids2#${encodeURIComponent(row.nome)}`} className="tourn-pname tourn-pname-link">
      {row.nome}
    </Link>
  );
}

const CIRCUIT_PILL: Record<string, { emoji: string; label: string; title: string; bg: string; fg: string }> = {
  FPG:    { emoji: "🇵🇹", label: "FPG",   title: "FPG",                          bg: "var(--accent-light)", fg: "var(--accent)" },
  USKids: { emoji: "🇺🇸", label: "USKids", title: "USKids",                       bg: "var(--bg-info)",      fg: "var(--color-info)" },
  Intl:   { emoji: "🌍", label: "Intl",   title: "Internacional (Bluegolf/Doral)", bg: "var(--bg-muted)",     fg: "var(--text-2)" },
};

function CircuitBadge({ circuitos }: { circuitos: Set<"FPG" | "USKids" | "Intl"> }) {
  const order: Array<"FPG" | "USKids" | "Intl"> = ["FPG", "USKids", "Intl"];
  return (
    <span style={{ display: "inline-flex", gap: 4, justifyContent: "center", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
      {order.filter(c => circuitos.has(c)).map(c => {
        const p = CIRCUIT_PILL[c];
        return (
          <span
            key={c}
            className="p p-sm"
            title={p.title}
            style={{ background: p.bg, color: p.fg, borderColor: "transparent", fontWeight: 700 }}
          >
            {p.emoji} {p.label}
          </span>
        );
      })}
    </span>
  );
}

// ── Página principal ──────────────────────────────────────────────────

// Para cada torneio FPG agregado, devolvemos uma URL canónica para a página
// interna `/FPG/torneio/{ccode}-{tcode}` (deep-link já suportado pela FPGPage).
function linkTorneioFPG(torneioId: string): string {
  return `/FPG/torneio/${torneioId}`;
}

// Lista colapsável e ordenada de torneios — usada para "Com draw", "Sem draw"
// e "Excluídos". Cada item é clicável e abre a página do torneio na FPGPage.
function TorneiosList({
  titulo,
  cor,
  items,
  emptyText,
  defaultOpen = true,
}: {
  titulo: string;
  cor: string;
  items: TorneioEntry[];
  emptyText: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: "1px solid var(--border-light)",
      borderRadius: "var(--radius-lg)",
      background: "var(--bg-card)",
      overflow: "hidden",
      boxShadow: "var(--shadow-sm)",
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          background: "var(--bg-header)",
          border: "none",
          borderBottom: open ? "1px solid var(--border-light)" : "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "var(--fs-12)",
          fontWeight: 800,
          color: "var(--text)",
        }}
      >
        <span style={{ color: "var(--text-3)", fontSize: "var(--fs-11)" }}>
          {open ? "▾" : "▸"}
        </span>
        <span
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: cor,
            flexShrink: 0,
          }}
        />
        <span style={{ textTransform: "uppercase", letterSpacing: "0.03em" }}>{titulo}</span>
        <span className="chip ml-auto" style={{ fontWeight: 700 }}>
          {items.length}
        </span>
      </button>
      {open && (
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          {items.length === 0 ? (
            <div className="muted p-10-12">
              {emptyText}
            </div>
          ) : (
            <ul style={{ margin: 0, padding: "4px 0", listStyle: "none" }}>
              {items.map((t) => (
                <li
                  key={t.torneioId}
                  style={{
                    padding: "5px 12px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    fontSize: 12.5,
                    borderBottom: "1px solid var(--border-light)",
                  }}
                >
                  <span
                    className="muted"
                    style={{ width: 78, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtDateShort(t.data)}
                  </span>
                  <Link
                    to={linkTorneioFPG(t.torneioId)}
                    className="courseLink"
                    style={{ flex: 1, lineHeight: 1.3 }}
                  >
                    {t.nome || t.torneioId}
                  </Link>
                  {t.rondas > 1 && (
                    <span
                      className="muted"
                      style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
                    >
                      {t.rondas}r
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function DrawsPage() {
  const [data, setData] = useState<PairingsFile | null>(null);
  const [intlLinks, setIntlLinks] = useState<IntlLink[]>([]);
  const [playersDb, setPlayersDb] = useState<PlayersDb>({});
  const [inativos, setInativos] = useState<PlayerLite[]>([]);
  const [fedAll, setFedAll] = useState<PlayerLite[]>([]);
  const [escFilter, setEscFilter] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("FPG");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("vezes", "desc", {
    nome: "asc",
    escalao: "asc",
    clube: "asc",
    vezes: "desc",
    ultima: "desc",
  });

  useEffect(() => {
    let alive = true;
    fetch("/data/manuel-pairings.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: PairingsFile) => alive && setData(j))
      .catch((e) => alive && setErro(String(e.message || e)));
    // Carregar links externos (Bluegolf/GolfGenius) — opcional
    fetch("/data/manuel-pairings-intl-links.json")
      .then(r => r.ok ? r.json() : null)
      .then((j: IntlLinksFile | null) => { if (alive && j?.links) setIntlLinks(j.links); })
      .catch(() => {});
    // players.json (cache partilhada) — escalão dos companheiros FPG
    loadPlayers()
      .then((db) => { if (alive) setPlayersDb(db); })
      .catch(() => {});
    // federados inativos juvenis — dob de quem já deixou de ser federado
    fetch("/data/federados-inativos-jovens.json")
      .then(r => r.ok ? r.json() : null)
      .then((j: any) => {
        if (!alive || !j?.players) return;
        setInativos(j.players.map((p: any) => ({
          fed: String(p.federation_code || ""),
          name: p.name || "",
          dob: p.birthdate || null,
        })));
      })
      .catch(() => {});
    // federados activos — dob de adultos + resolução de nomes por clube
    // (16MB; cachedFetchJson partilha a cache com as outras páginas)
    cachedFetchJson<any>("/data/federados.json")
      .then((j: any) => {
        if (!alive || !j) return;
        const rows: any[] = Array.isArray(j) ? j : (j.players || []);
        setFedAll(rows.map((p: any) => ({
          fed: String(p.federation_code || ""),
          name: p.name || "",
          dob: p.birthdate || null,
          clubNorm: norm(`${p.club_name || ""} ${p.acronym || ""}`),
        })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Índices de resolução de identidade (nome/fed/dob).
  // Estratégia para não introduzir ambiguidade:
  //  - dobByFed: TODAS as fontes (players + inativos + federados) → escalão p/ adultos
  //  - byNorm (exacto): players+inativos + federados com nome ÚNICO
  //  - byISsmall (inicial+apelido): só players+inativos → resolve o pai sem ruído
  //  - byISfed (inicial+apelido): federados (com clube) → desambigua por clube
  const lookups = useMemo<Lookups>(() => {
    const lk: Lookups = {
      dobByFed: new Map(), byNorm: new Map(), byISsmall: new Map(), byISfed: new Map(),
    };
    const isKey = (nm: string) => {
      const parts = nm.split(" ");
      return parts.length >= 2 ? `${parts[0][0]}|${parts[parts.length - 1]}` : null;
    };
    // Fontes pequenas e curadas — prioridade no byNorm e únicas no byISsmall
    const addSmall = (fed: string, name: string, dob: string | null) => {
      if (!fed) return;
      if (dob && !lk.dobByFed.has(fed)) lk.dobByFed.set(fed, dob);
      const nm = norm(name);
      if (!nm) return;
      const lite: PlayerLite = { fed, name: displayName(name), dob };
      if (!lk.byNorm.has(nm)) lk.byNorm.set(nm, lite);
      const k = isKey(nm);
      if (k) { const a = lk.byISsmall.get(k) || []; a.push(lite); lk.byISsmall.set(k, a); }
    };
    for (const [fed, p] of Object.entries(playersDb)) addSmall(fed, (p as any).name || "", (p as any).dob || null);
    for (const p of inativos) addSmall(p.fed, p.name, p.dob);
    // Federados activos — dob + índice por inicial/apelido (c/ clube) + exacto único
    const nameCount = new Map<string, number>();
    for (const p of fedAll) { const nm = norm(p.name); if (nm) nameCount.set(nm, (nameCount.get(nm) || 0) + 1); }
    for (const p of fedAll) {
      if (!p.fed) continue;
      if (p.dob && !lk.dobByFed.has(p.fed)) lk.dobByFed.set(p.fed, p.dob);
      const nm = norm(p.name);
      if (!nm) continue;
      const lite: PlayerLite = { fed: p.fed, name: displayName(p.name), dob: p.dob, clubNorm: p.clubNorm };
      // exacto: só se único nos federados e ainda não definido pelas fontes curadas
      if (nameCount.get(nm) === 1 && !lk.byNorm.has(nm)) lk.byNorm.set(nm, lite);
      const k = isKey(nm);
      if (k) { const a = lk.byISfed.get(k) || []; a.push(lite); lk.byISfed.set(k, a); }
    }
    return lk;
  }, [playersDb, inativos, fedAll]);

  // Rondas filtradas pelo tab — Intl junta USKids + Intl (todos os internacionais)
  const rondasFiltradas = useMemo(() => {
    if (!data) return [];
    if (tab === "FPG") return data.rondas.filter(r => r.circuito === "FPG");
    return data.rondas.filter(r => r.circuito === "USKids" || r.circuito === "Intl");
  }, [data, tab]);

  // Agregação por companheiro
  const linhas = useMemo(() => aggregateCompanions(rondasFiltradas, lookups), [rondasFiltradas, lookups]);

  // Filtro por escalão (toggle pills)
  const linhasFiltradas = useMemo(() => {
    if (escFilter.size === 0) return linhas;
    return linhas.filter(r => escFilter.has(r.escalao || "—"));
  }, [linhas, escFilter]);

  // Ordenação
  const linhasOrdenadas = useMemo(() => {
    const cmp = (a: CompanionRow, b: CompanionRow): number => {
      let v = 0;
      switch (sortKey) {
        case "nome":
          v = a.nome.localeCompare(b.nome, "pt");
          break;
        case "escalao":
          v = escRank(a.escalao) - escRank(b.escalao);
          if (v === 0) v = a.nome.localeCompare(b.nome, "pt");
          break;
        case "clube":
          v = (a.clube || a.pais || "").localeCompare(b.clube || b.pais || "", "pt");
          break;
        case "vezes":
          v = a.vezes - b.vezes;
          break;
        case "ultima":
          v = (a.ultimaData || "").localeCompare(b.ultimaData || "");
          break;
      }
      return sortDir === "asc" ? v : -v;
    };
    return [...linhasFiltradas].sort(cmp);
  }, [linhasFiltradas, sortKey, sortDir]);

  // Escalões presentes (para os pills de filtro), ordenados
  const escaloesPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const r of linhas) s.add(r.escalao || "—");
    return [...s].sort((a, b) => escRank(a === "—" ? null : a) - escRank(b === "—" ? null : b));
  }, [linhas]);

  // Ranking por nº de rondas (independente da ordenação da tabela) — medalhas
  // para os 3 companheiros com mais rondas. rankByVezes: key → posição.
  const rankByVezes = useMemo(() => {
    const sorted = [...linhas].sort((a, b) => b.vezes - a.vezes);
    const rank = new Map<string, number>();
    sorted.forEach((r, i) => rank.set(r.key, i + 1));
    return rank;
  }, [linhas]);

  // Toggle expand de uma linha
  const toggleExpand = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // ── Listas de torneios FPG: COM draw (derivada das rondas), SEM draw
  // (do JSON cobertura), e silenciosamente excluídos (ccode 982 — Drive
  // Challenge Madeira, reatribuído pela FPG a Açores).
  const listasFpgTorneios = useMemo(() => {
    if (!data || !data.cobertura?.fpg) return { com: [], sem: [], skip: [], skipCcodes: [] };
    const cov = data.cobertura.fpg;
    // COM draw — derivar de data.rondas se o JSON ainda não trouxer o detalhe
    let com: TorneioEntry[];
    if (cov.torneiosComDrawDetalhe?.length) {
      com = cov.torneiosComDrawDetalhe;
    } else {
      const map = new Map<string, TorneioEntry>();
      for (const r of data.rondas) {
        if (r.circuito !== "FPG") continue;
        const e = map.get(r.torneioId);
        if (!e) {
          map.set(r.torneioId, {
            torneioId: r.torneioId,
            nome: r.torneioNome,
            data: r.data,
            rondas: 1,
          });
        } else {
          e.rondas += 1;
          if (r.data && (!e.data || r.data > e.data)) e.data = r.data;
        }
      }
      com = [...map.values()].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    const sem: TorneioEntry[] = cov.torneiosSemDrawDetalhe || [];
    const skip: TorneioEntry[] = cov.torneiosSkippedDetalhe || [];
    const skipCcodes: string[] = cov.skipCcodes || [];
    return { com, sem, skip, skipCcodes };
  }, [data]);

  // Contagens por tab (FPG + Intl, onde Intl junta USKids+Intl)
  const contagensTab = useMemo(() => {
    if (!data) return { FPG: 0, Intl: 0 };
    let fpg = 0, intl = 0;
    for (const r of data.rondas) {
      if (r.circuito === "FPG") fpg++;
      else intl++;
    }
    return { FPG: fpg, Intl: intl };
  }, [data]);

  // Cobertura agregada do tab actual (rondas com draw / total jogado)
  const covTab = useMemo<CoverageBlock | null>(() => {
    if (!data || !data.cobertura) return null;
    if (tab === "FPG") return data.cobertura.fpg || null;
    const u = data.cobertura.uskids;
    const i = (data.cobertura as any).intl as CoverageBlock | undefined;
    if (u && i) {
      return {
        rondasJogadas: (u.rondasJogadas || 0) + (i.rondasJogadas || 0),
        rondasComDraw: (u.rondasComDraw || 0) + (i.rondasComDraw || 0),
        torneiosJogados: (u.torneiosJogados || 0) + (i.torneiosJogados || 0),
        torneiosComDraw: (u.torneiosComDraw || 0) + (i.torneiosComDraw || 0),
      };
    }
    return u || null;
  }, [data, tab]);

  const covPct = covTab && covTab.rondasJogadas > 0
    ? Math.round((100 * covTab.rondasComDraw) / covTab.rondasJogadas)
    : null;
  const covColor = covPct == null
    ? "var(--text)"
    : covPct >= 80 ? "var(--color-good)" : covPct >= 50 ? "var(--color-warn)" : "var(--color-danger)";

  return (
    <div className="page-full page-full--wide">
      <Toolbar>
        <ToolbarTitle>🏌️ Draws — Manuel</ToolbarTitle>
        <ToolbarMeta>Companheiros de jogo do Manuel em torneios</ToolbarMeta>
        {data && (
          <span className="chip ml-auto">
            actualizado {fmtDateShort(data.geradoEm.slice(0, 10))}
          </span>
        )}
      </Toolbar>

      {/* KPI cards — actualizam com o tab seleccionado */}
      {data && (
        <div className="kpi-row">
          <KpiCard label="Rondas em conjunto" value={contagensTab[tab]} sub={tab === "FPG" ? "FPG" : "internacionais"} />
          <KpiCard label="Companheiros únicos" value={linhasOrdenadas.length} sub="neste circuito" />
          {covTab && (
            <KpiCard label="Cobertura de draws" value={covPct != null ? `${covPct}%` : "—"} color={covColor}
              sub={`${covTab.rondasComDraw}/${covTab.rondasJogadas} rondas`} />
          )}
          {covTab && (
            <KpiCard label="Torneios" value={covTab.torneiosComDraw} sub={`de ${covTab.torneiosJogados} com draw`} />
          )}
        </div>
      )}

      {/* Tabs — só FPG e Internacional (Intl junta USKids + Bluegolf/GolfGenius) */}
      <div className="segmented-toggle mb-16" role="tablist" aria-label="Circuito">
        {(["FPG", "Intl"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`seg-btn${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            <span className="seg-label">{t === "FPG" ? "🇵🇹 FPG" : "🌍 Internacional"}</span>
            <span className="seg-count">{contagensTab[t]}</span>
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div>
        {erro && (
          <div className="notice notice-error">
            Erro ao carregar pairings: {erro}
          </div>
        )}

        {!erro && !data && (
          <LoadingState size="sm" message="A carregar pairings…" />
        )}

        {data && linhasOrdenadas.length === 0 && (
          <EmptyState message="Sem dados para este torneio." />
        )}

        {/* Aviso de rondas sem draw scrapado (só FPG) */}
        {data && tab === "FPG" && covTab && (covTab.rondasJogadas - covTab.rondasComDraw) > 0 && (
          <div className="notice notice-warn">
            ⚠ {covTab.rondasJogadas - covTab.rondasComDraw} rondas em{" "}
            {covTab.torneiosJogados - covTab.torneiosComDraw} torneios sem draw scrapado
            (maioritariamente clubes regionais fora do scope de <code>fpg-admissions-draws</code>).
          </div>
        )}

        {/* Filtro por escalão */}
        {data && linhas.length > 0 && escaloesPresentes.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="h-xs" style={{ margin: 0, marginRight: 2 }}>Escalão:</span>
            {escaloesPresentes.map(e => {
              const active = escFilter.has(e);
              const label = e === "—" ? "sem escalão" : e;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEscFilter(prev => {
                    const next = new Set(prev);
                    next.has(e) ? next.delete(e) : next.add(e);
                    return next;
                  })}
                  className="p p-sm"
                  style={{
                    cursor: "pointer",
                    border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                    background: active ? "var(--accent-light)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-2)",
                    fontWeight: active ? 700 : 600,
                  }}
                >
                  {label}
                </button>
              );
            })}
            {escFilter.size > 0 && (
              <button type="button" className="btn-link muted" style={{ fontSize: "var(--fs-11)" }} onClick={() => setEscFilter(new Set())}>
                limpar
              </button>
            )}
          </div>
        )}

        {data && linhasOrdenadas.length > 0 && (
          <div style={{
            display: tab === "FPG" ? "flex" : "block",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}>
          <div
            className="card"
            style={{ margin: 0, padding: 0, overflowX: "auto", flex: "0 1 auto", minWidth: 0 }}
          >
            <table className="dtable" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <SortableHdr k="nome" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Companheiro
                  </SortableHdr>
                  <SortableHdr k="escalao" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 78 }}>
                    Escalão
                  </SortableHdr>
                  <SortableHdr k="clube" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    {tab === "FPG" ? "Clube" : "País"}
                  </SortableHdr>
                  <SortableHdr k="vezes" className="r" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Rondas
                  </SortableHdr>
                  <SortableHdr k="ultima" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Último encontro
                  </SortableHdr>
                  <th style={{ width: 140, minWidth: 140, textAlign: "center" }}>Circ.</th>
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map((row) => {
                  const open = expanded.has(row.key);
                  const rank = rankByVezes.get(row.key) || 0;
                  const medal = MEDALS[rank];
                  return (
                    <Fragment key={row.key}>
                      <tr
                        className="roundRow"
                        style={{ cursor: "pointer", background: open ? "var(--bg-detail)" : undefined }}
                        onClick={() => toggleExpand(row.key)}
                      >
                        <td style={{ textAlign: "center", color: "var(--text-3)" }}>
                          {open ? "▾" : "▸"}
                        </td>
                        <td>
                          <CompanionNameLink row={row} />
                        </td>
                        <td>
                          {row.escalao ? <EscPill esc={row.escalao} /> : <span className="muted">—</span>}
                        </td>
                        <td style={{ color: "var(--text-2)" }}>
                          {tab === "FPG"
                            ? (row.clube || "—")
                            : (row.pais ? `${FLAG[row.pais] || ""} ${row.pais}` : "—")}
                        </td>
                        <td className="r" style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {medal ? <span style={{ marginRight: 3 }}>{medal}</span> : null}{row.vezes}
                        </td>
                        <td>{fmtDateShort(row.ultimaData)}</td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <CircuitBadge circuitos={row.circuitos} />
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--bg-detail)", padding: "10px 14px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                              <span className="h-xs" style={{ margin: 0 }}>
                                Frente a frente — Manuel vs {row.nome.split(" ")[0]} ({row.rondas.length} {row.rondas.length === 1 ? "ronda" : "rondas"})
                              </span>
                              <span className="legend-row" style={{ margin: 0, marginLeft: "auto" }}>
                                <span className="legend-item"><span className="legend-dot" style={{ background: "var(--color-good)", borderRadius: "50%" }} /> Manuel melhor</span>
                                <span className="legend-item"><span className="legend-dot" style={{ background: "var(--text-muted)", borderRadius: "50%" }} /> empate</span>
                                <span className="legend-item"><span className="legend-dot" style={{ background: "var(--color-danger)", borderRadius: "50%" }} /> companheiro melhor</span>
                              </span>
                            </div>
                            {(() => {
                              const rec = h2hRecord(row.rondas);
                              if (rec.played === 0) return null;
                              const seg = (n: number, color: string, label: string) =>
                                n > 0 ? <span title={`${n} ${label}`} style={{ flex: n, background: color }} /> : null;
                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                                  <span style={{ display: "flex", height: 8, width: 160, borderRadius: 4, overflow: "hidden", background: "var(--bg-hover)" }}>
                                    {seg(rec.w, "var(--color-good)", "vitórias do Manuel")}
                                    {seg(rec.d, "var(--text-muted)", "empates")}
                                    {seg(rec.l, "var(--color-danger)", "vitórias do companheiro")}
                                  </span>
                                  <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                    <span style={{ color: "var(--color-good)" }}>{rec.w}V</span>
                                    <span className="muted" style={{ fontWeight: 400 }}> · </span>
                                    <span style={{ color: "var(--text-2)" }}>{rec.d}E</span>
                                    <span className="muted" style={{ fontWeight: 400 }}> · </span>
                                    <span style={{ color: "var(--color-danger)" }}>{rec.l}D</span>
                                  </span>
                                  <span className="muted" style={{ fontSize: "var(--fs-11)" }}>
                                    {rec.w > rec.l ? "Manuel leva vantagem" : rec.l > rec.w ? `${row.nome.split(" ")[0]} leva vantagem` : "equilibrado"}
                                    {" "}({rec.played} {rec.played === 1 ? "ronda comparável" : "rondas comparáveis"})
                                  </span>
                                </div>
                              );
                            })()}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {row.rondas.map((r, i) => {
                                const dot = h2hDot(r.manuelScore, r.companheiroScore);
                                // Só o score do Manuel leva cor (verde ganhou / vermelho
                                // perdeu); o do companheiro fica neutro — a cor aparece
                                // sempre na mesma posição, leitura consistente
                                const manuelCor = dot?.res === "W" ? "var(--color-good)"
                                  : dot?.res === "L" ? "var(--color-danger)"
                                  : "var(--text)";
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                      flexWrap: "wrap",
                                      padding: "7px 10px",
                                      background: "var(--bg-card)",
                                      border: "1px solid var(--border-light)",
                                      borderRadius: "var(--radius)",
                                    }}
                                  >
                                    <span className="muted" style={{ width: 74, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                                      {fmtDateShort(r.data)}
                                    </span>
                                    <span style={{ flexShrink: 0 }}>
                                      <RondaPill n={r.ronda} />
                                    </span>
                                    <span style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {r.circuito === "FPG" && r.torneioId.includes("-") ? (
                                        <Link to={`/FPG/torneio/${r.torneioId}`} className="courseLink">{r.torneioNome}</Link>
                                      ) : (
                                        r.torneioNome
                                      )}
                                    </span>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                                      {dot && (
                                        <span title={dot.title} style={{ width: 8, height: 8, borderRadius: "50%", background: dot.color, flexShrink: 0 }} />
                                      )}
                                      <span style={{ color: manuelCor, fontWeight: 700, minWidth: 60, textAlign: "right" }}>
                                        {fmtScore(r.manuelScore)}
                                      </span>
                                      <span className="muted" style={{ fontSize: "var(--fs-11)" }}>vs</span>
                                      <span style={{ color: "var(--text)", fontWeight: 700, minWidth: 60 }}>
                                        {fmtScore(r.companheiroScore)}
                                      </span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700, background: "var(--bg-header)" }}>
                  <td></td>
                  <td>TOTAL</td>
                  <td></td>
                  <td className="muted" style={{ fontWeight: 400 }}>
                    {linhasOrdenadas.length} {linhasOrdenadas.length === 1 ? "jogador" : "jogadores"} únicos
                  </td>
                  <td className="r">
                    {linhasOrdenadas.reduce((s, r) => s + r.vezes, 0)}
                  </td>
                  <td colSpan={2} className="muted" style={{ fontWeight: 400 }}>
                    {(() => {
                      const nrondas = rondasFiltradas.length;
                      return `${nrondas} ${nrondas === 1 ? "ronda" : "rondas"} com draw`;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Painel lateral — listas de torneios FPG (Com/Sem/Excluídos) */}
          {tab === "FPG" && (
            <aside style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: "1 1 280px",
              minWidth: 280,
              maxWidth: 380,
            }}>
              <div className="muted" style={{ lineHeight: 1.4 }}>
                Detalhe dos torneios FPG do Manuel — clica num para abrir a página do torneio.
              </div>
              <TorneiosList
                titulo="Com draw scrapado"
                cor="var(--color-good)"
                items={listasFpgTorneios.com}
                emptyText="Nenhum torneio com draw."
                defaultOpen={false}
              />
              <TorneiosList
                titulo="Sem draw — passíveis de scrapar"
                cor="var(--color-warn)"
                items={listasFpgTorneios.sem}
                emptyText="Todos os torneios têm draw."
                defaultOpen={true}
              />
              {listasFpgTorneios.skip.length > 0 && (
                <TorneiosList
                  titulo={`Excluídos (ccode ${(listasFpgTorneios.skipCcodes || []).join(", ") || "?"})`}
                  cor="var(--text-muted)"
                  items={listasFpgTorneios.skip}
                  emptyText="Nada excluído."
                  defaultOpen={false}
                />
              )}
              {listasFpgTorneios.skip.length === 0 && listasFpgTorneios.skipCcodes.length > 0 && (
                <div className="notice notice-info" style={{ margin: 0, borderStyle: "dashed" }}>
                  ⓘ {listasFpgTorneios.skipCcodes.length === 1 ? "Ccode" : "Ccodes"}{" "}
                  <code>{listasFpgTorneios.skipCcodes.join(", ")}</code>{" "}
                  são silenciosamente excluídos do scrape (Drive Challenge Madeira — a FPG reatribuiu o ccode a Açores). Re-correr <code>scripts/pairings-build.js</code> para listar.
                </div>
              )}
            </aside>
          )}
          </div>
        )}

        {/* Fontes internacionais (USKids signupanytime + Bluegolf/GolfGenius) —
            depois da tabela e colapsadas: só interessam para confirmar tee times. */}
        {data && tab === "Intl" && (() => {
          const uskTorneios = new Map<string, { nome: string; data: string | null; rondas: number; t: string }>();
          for (const r of data.rondas) {
            if (r.circuito !== "USKids") continue;
            const t = r.torneioId.replace(/^usk-/, "");
            const e = uskTorneios.get(r.torneioId);
            if (!e) uskTorneios.set(r.torneioId, { nome: r.torneioNome, data: r.data, rondas: 1, t });
            else {
              e.rondas += 1;
              if (r.data && (!e.data || r.data < e.data)) e.data = r.data;
            }
          }
          const lista = [...uskTorneios.values()].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
          if (lista.length === 0 && intlLinks.length === 0) return null;
          return (
            <details className="details-block" style={{ marginTop: 16 }}>
              <summary>Fontes & tee times internacionais (USKids · Bluegolf · GolfGenius)</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {lista.length > 0 && (
                  <div>
                    <div className="h-xs" style={{ marginBottom: 6 }}>
                      🇺🇸 Torneios USKids do Manuel (pairings via signupanytime)
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {lista.map((tn, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          <a href={`https://www.signupanytime.com/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${tn.t}`} target="_blank" rel="noopener" className="courseLink">
                            {tn.nome}
                          </a>
                          <span className="muted">
                            {" "}— signupanytime · {tn.rondas} {tn.rondas === 1 ? "ronda" : "rondas"}{tn.data ? ` · ${fmtDateShort(tn.data)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {intlLinks.length > 0 && (
                  <div>
                    <div className="h-xs" style={{ marginBottom: 6 }}>
                      🔗 Tee times noutros sites externos (Bluegolf / GolfGenius)
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {intlLinks.map((lnk, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          <a href={lnk.url} target="_blank" rel="noopener" className="courseLink">
                            {lnk.nome}
                          </a>
                          <span className="muted">
                            {" "}— {lnk.fonte}{lnk.ronda !== "all" ? ` R${lnk.ronda}` : ""}{lnk.notas ? ` · ${lnk.notas}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          );
        })()}
      </div>
    </div>
  );
}
