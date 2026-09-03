/**
 *
 * ═══════════════════════════════════════════════════════════════
 * FAMÍLIA DE TABELAS — MANTER SEMPRE EM SINCRONIA
 * ═══════════════════════════════════════════════════════════════
 * Este ficheiro faz parte de uma família de componentes de tabela
 * que partilham as mesmas regras visuais (App.css: .sc-lb):
 *
 *   • ScorecardLeaderboard.tsx   — leaderboard buraco-a-buraco
 *   • MultiRoundLeaderboard.tsx  — leaderboard multi-ronda
 *   • CrossSeasonTable.tsx       — tabela temporada cruzada
 *   • tournamentPrimitives.tsx   — primitivas partilhadas
 *
 * Ao alterar qualquer um, verifica se os outros precisam de ser
 * actualizados: fontes, padding, bordas, cores, larguras de colunas.
 * ═══════════════════════════════════════════════════════════════
 * tournamentPrimitives.tsx
 *
 * Primitivos de UI partilhados entre DrivePage, TorneiosAnalisePage, BJGTPage e similares.
 * Importar daqui em vez de redefinir em cada página.
 *
 * Exporta:
 *   MANUEL_FED        — código de federado do Manuel
 *   isManuel()        — detecta o jogador especial
 *   fmtTP()           — formata to-par: +3 / -2 / E / –
 *   tpColor()         — cor CSS para to-par (vermelho/verde/undefined)
 *   ESC_STYLE         — mapa de cores por escalão
 *   TeeDot            — quadrado colorido de tee
 *   TournPName        — nome clicável do jogador com ícone M/F e estrela Manuel
 */

import { useContext } from "react";
import SexBadge from "./SexBadge";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { normLoose } from "../utils/normName";
import { fmtToPar } from "../utils/format";
import { flag as flagOf } from "../utils/flagUtils";

/* ─── Constante do jogador especial (re-export de constants/manuel) ─── */
import { MANUEL_FED as _MANUEL_FED, isManuel } from "../constants/manuel";
import { kidsUrl, KidsLinkCtx } from "./KidsLink";
export { _MANUEL_FED as MANUEL_FED, isManuel };

/* ─── Formatação to-par ─── */
/** @deprecated Usa fmtToPar de utils/format. Mantido por compatibilidade. */
export const fmtTP = (v: number | null | undefined): string => fmtToPar(v, "–");

export function tpColor(v: number | null | undefined): string | undefined {
  if (v == null) return undefined;
  if (v < 0) return "var(--color-good)";
  if (v > 0) return "var(--color-danger)";
  return undefined;
}

/* ─── Tee dot ─── */
export function TeeDot({ teeName }: { teeName?: string }) {
  if (!teeName) return <span className="muted">–</span>;
  const hex = getTeeHex(teeName);
  const border = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
  return (
    <span title={teeName} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", cursor: "default" }}>
      <span
        className="shrink-0"
        style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: hex, border, verticalAlign: "middle" }}
      />
    </span>
  );
}

/* ─── SD pill inline (sem <td>) ─── */
export function SDPill({
  sd, source, hcp, hideRawTip,
}: {
  sd: number | null;
  source?: string | null;
  hcp?: number | null;
  /** Quando true, esconde o símbolo "≈" para source="raw" (útil em USKids onde
   *  todos os SDs raw são equivalentes — o símbolo passa a redundante). */
  hideRawTip?: boolean;
}) {
  if (sd == null) {
    return (
      <span
        className="muted"
        title="SD não calculável — falta Course Rating e/ou Slope deste tee. Adicionar os campos cr/slope no TEES_LOOKUP (src/ui/uskidsData.ts) para o torneio/escalão."
      >–</span>
    );
  }
  const cls = sdClassByHcp(sd, hcp ?? null);
  const tip = source === "fpg" ? "" : source === "ags" ? "~" : "≈";
  const showTip = tip && !(hideRawTip && source !== "ags" && source !== "fpg");
  const title = source === "ags"
    ? `SD exacto (AGS — usa HCP ${hcp ?? "?"})`
    : source === "fpg"
      ? "SD oficial FPG"
      : "SD aproximado (sem HCP — Net Double Bogey não aplicado)";
  return (
    <span className={"p p-sm p-" + cls} title={title}>
      {sd.toFixed(1)}
      {showTip && <span className="fs-10 op-6"> {tip}</span>}
    </span>
  );
}

/* ─── Nome do jogador ───────────────────────────────────────── */
export interface PlayersDBEntry {
  escalao?: string;
  name?: string;
  club?: { short?: string };
  sex?: string;
  hcp?: number;
  hcpExact?: number;
  region?: string;
  kidsHash?: string;
  /** Código ISO-2 da nacionalidade (vem de players-nationality.json para
   *  federados FPG, ou de kids-links.json para internacionais). Se preenchido
   *  e ≠ "PT", o TournPName prepende a bandeira ao nome. */
  country?: string;
  /** Data de nascimento (YYYY-MM-DD). Vem de players.json, players-nationality
   *  info ou kids-links. Usado para calcular idade exacta na data do torneio. */
  dob?: string;
}
export type PlayersDB = Record<string, PlayersDBEntry>;

export const EMPTY_ESC_LOOKUP = new Map<string, string>();
export const EMPTY_PLAYERS_DB: PlayersDB = {} as PlayersDB;

/** Strip diacríticos + lowercase + espaços únicos. Usado para lookup rápido. */
const normNameLocal = (s: string | undefined) => normLoose(s || "");

/** Cache de índices por nome para cada `playersDB` distinto. WeakMap permite
 *  GC quando o playersDB é substituído (não causa memory leak entre renders). */
const _nameIndexCache = new WeakMap<PlayersDB, Map<string, PlayersDBEntry[]>>();

/** Constrói (ou devolve cached) índice {normName → [entries com esse nome]}.
 *  Por que array: múltiplos entries podem partilhar o mesmo normName (ex:
 *  Joe Short tem o entry "51804" do players.json E o entry "intl:joe_short"
 *  do kids-links). Devolvemos todos para o caller escolher por campo. */
function getNameIndex(playersDB: PlayersDB): Map<string, PlayersDBEntry[]> {
  let idx = _nameIndexCache.get(playersDB);
  if (idx) return idx;
  idx = new Map<string, PlayersDBEntry[]>();
  for (const k in playersDB) {
    const e = playersDB[k];
    const nn = normNameLocal(e.name);
    if (!nn) continue;
    const arr = idx.get(nn);
    if (arr) arr.push(e); else idx.set(nn, [e]);
  }
  _nameIndexCache.set(playersDB, idx);
  return idx;
}

export function TournPName({
  name,
  fed,
  fedCode,
  playersDB,
  highlight,
  maxLen = 26,
  sex: sexProp,
  country: countryProp,
  juniorId,
}: {
  name: string;
  fed?: string;
  fedCode?: string;
  /** Id do agregador de juniores ("r" + licença). Quando existe, o link ↗
   *  usa-o em vez do kidsHash resolvido por nome — ver kidsHref(). */
  juniorId?: string;
  playersDB?: PlayersDB;
  highlight?: boolean;
  maxLen?: number;
  /** Sexo vindo da própria fonte (ex: linha do torneio), usado quando o
   *  jogador não está no playersDB. Evita que quem chama acrescente um
   *  segundo SexBadge por fora — o badge é sempre renderizado aqui. */
  sex?: string;
  /** Nacionalidade (ISO-2) vinda da própria fonte, para quem não está no
   *  playersDB — caso dos draws internacionais, onde a esmagadora maioria não
   *  tem federado nenhum do nosso lado. Só usada se o playersDB nada souber. */
  country?: string;
}) {
  const fedKey = fed || fedCode;
  const hasLink = !!fedKey;
  const hasProfile = !!(fedKey && playersDB && playersDB[fedKey]);
  const star = highlight ?? isManuel({ name, fed, fedCode });
  const truncName = name.length > maxLen ? name.substring(0, maxLen - 2) + "…" : name;

  // Lookup duplo independente: por fedKey directo (federados FPG → sex+country
  // de players.json + players-nationality.json) e por nome normalizado
  // (entries virtuais "intl:..." de kids-links.json → kidsHash). Para um
  // federado FPG estrangeiro como Joe Short (51804), ambos resolvem:
  // directo → country=GB; nome → kidsHash="Joe%20Short".
  //
  // CADA CAMPO faz a sua própria pesquisa por nome exigindo o campo
  // específico — caso contrário o `Object.values().find()` apanha o entry
  // FPG (que não tem kidsHash) ANTES do entry intl:* (que tem), dado que
  // ambos têm name="Joe Short" e a iteração segue insertion order.
  // Lookup O(1) via índice cached: getNameIndex(playersDB) devolve um Map
  // construído UMA vez por playersDB. Antes era Object.values().find() = O(N)
  // por jogador × 3 campos × 100+ jogadores por tabela = 18M operações. Lento.
  const normN = normNameLocal(name);
  const directEntry = fedKey && playersDB ? playersDB[fedKey] : undefined;
  const candidates: PlayersDBEntry[] = playersDB ? (getNameIndex(playersDB).get(normN) ?? []) : [];
  // Para cada campo (sex/kidsHash/country): preferir directEntry; fallback aos
  // candidates por nome (filtrar pelo campo desejado para evitar apanhar entry
  // FPG sem kidsHash quando há um intl: com kidsHash).
  const sex = directEntry?.sex ?? candidates.find(e => e.sex)?.sex ?? sexProp;
  const kidsHash = directEntry?.kidsHash ?? candidates.find(e => e.kidsHash)?.kidsHash;
  const country = directEntry?.country ?? candidates.find(e => e.country)?.country ?? countryProp;
  // PT não leva bandeira por defeito — num site português seria ruído em todas
  // as linhas. A excepção é o país vir por PROP: só as páginas de circuitos
  // estrangeiros a passam, e aí ver a bandeira portuguesa é justamente o ponto.
  const flagEmoji = country && (!!countryProp || country.toUpperCase() !== "PT")
    ? flagOf(country) : null;

  // ── Seta ↗ para /kids2: UMA so, resolvida aqui ──────────────────────────
  // Tres origens, por ordem de fiabilidade:
  //   1. juniorId  — id do agregador ("r"+licenca federativa). Deterministico.
  //   2. kidsHash  — do playersDB (entradas virtuais kids:/intl: por NOME).
  //   3. KidsLinkCtx — mapa por nome fornecido pelas paginas de circuito.
  // A (3) estava a ser desenhada por um <KidsLink> IRMAO nos chamadores, o que
  // punha DUAS setas na mesma linha quando (2) e (3) resolviam ambas. Passa a
  // ser resolvida aqui, para haver sempre exactamente uma.
  const ctxEntry = useContext(KidsLinkCtx).get(normNameLocal(name));
  const kidsLink =
    juniorId ? kidsUrl({ id: juniorId })
    : kidsHash ? `/kids2#${kidsHash}`   // ja vem codificado pelo FPGPage
    : ctxEntry ? kidsUrl({ id: ctxEntry.id, memberId: ctxEntry.memberId, name: ctxEntry.n })
    : null;

  const titleMsg = hasLink && !hasProfile ? "Federado (perfil limitado — dados do federados.json)" : undefined;
  const inner = (
    <>
      {flagEmoji && (
        <span aria-label={country} title={country} style={{ marginRight: 4, fontSize: "1em", lineHeight: 1 }}>{flagEmoji}</span>
      )}
      {truncName}
      {star && <span className="fs-10 print-hide-star" style={{ marginLeft: 3 }}>⭐</span>}
      {sex &&
 <SexBadge sex={sex} size="sm" className="ml-4" />}
    </>
  );
  const nameEl = hasLink ? (
    <a
      href={`/jogadores/${fedKey}`}
      target="_blank"
      rel="noopener noreferrer"
      className="tourn-pname tourn-pname-link"
      title={titleMsg}
      style={{ color: "inherit", textDecoration: "none" }}
    >{inner}</a>
  ) : (
    <span className="tourn-pname" title={titleMsg}>{inner}</span>
  );
  return (
    <>
      {nameEl}
      {kidsLink && (
        <a
          href={kidsLink}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver em Kids"
          style={{ marginLeft: 4, fontWeight: 800, color: "var(--color-good-dark)", fontSize: "var(--fs-11)", textDecoration: "none" }}>
          ↗
        </a>
      )}
    </>
  );
}
