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

import SexBadge from "./SexBadge";
import { getTeeHex, teeBorder } from "../utils/teeColors";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { C } from "../utils/colors";
import { fmtToPar } from "../utils/format";
import { flag as flagOf } from "../utils/flagUtils";

/* ─── Constante do jogador especial (re-export de constants/manuel) ─── */
import { MANUEL_FED as _MANUEL_FED, isManuel } from "../constants/manuel";
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

/* ─── Escalão pill ─── */
export const ESC_STYLE: Record<string, { bg: string; color: string }> = {
  "sub10": { bg: C.esc.sub10.bg, color: C.esc.sub10.fg },
  "sub12": { bg: C.esc.sub12.bg, color: C.esc.sub12.fg },
  "sub14": { bg: C.esc.sub14.bg, color: C.esc.sub14.fg },
  "sub16": { bg: C.esc.sub16.bg, color: C.esc.sub16.fg },
  "sub18": { bg: C.esc.sub18.bg, color: C.esc.sub18.fg },
};

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
  sd, source, hcp,
}: {
  sd: number | null;
  source?: string | null;
  hcp?: number | null;
}) {
  if (sd == null) return <span className="muted">–</span>;
  const cls = sdClassByHcp(sd, hcp ?? null);
  const tip = source === "fpg" ? "" : source === "ags" ? "~" : "≈";
  return (
    <span className={"p p-sm p-" + cls}>
      {sd.toFixed(1)}
      {tip && <span className="fs-10 op-6"> {tip}</span>}
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
}
export type PlayersDB = Record<string, PlayersDBEntry>;

export const EMPTY_ESC_LOOKUP = new Map<string, string>();
export const EMPTY_PLAYERS_DB: PlayersDB = {} as PlayersDB;

export function TournPName({
  name,
  fed,
  fedCode,
  playersDB,
  highlight,
  maxLen = 26,
}: {
  name: string;
  fed?: string;
  fedCode?: string;
  playersDB?: PlayersDB;
  highlight?: boolean;
  maxLen?: number;
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
  // Normalização strip-diacríticos para casar com kids-tracked-names.json
  // (que armazena "García" como "garcia"). Sem isto, jogadores com acentos
  // não fariam match com o índice /kids gerado.
  const normStr = (s: string | undefined) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const normN = normStr(name);
  // Match exacto OU por prefixo (FPG abrevia "Marcos Ledesma Orozco" → "Marcos
  // Ledesma"). Exigimos pelo menos 2 palavras e que o prefixo termine em
  // boundary de palavra para não casar "John" com "Johnson".
  const matchesName = (e: PlayersDBEntry) => {
    const en = normStr(e.name);
    if (en === normN) return true;
    if (!en || !normN || normN.split(" ").length < 2) return false;
    return en.startsWith(normN + " ") || normN.startsWith(en + " ");
  };
  const directEntry = fedKey && playersDB ? playersDB[fedKey] : undefined;
  const sex = directEntry?.sex
    ?? (playersDB ? Object.values(playersDB).find(e => matchesName(e) && e.sex)?.sex : undefined);
  const kidsHash = directEntry?.kidsHash
    ?? (playersDB ? Object.values(playersDB).find(e => matchesName(e) && e.kidsHash)?.kidsHash : undefined);
  const country = directEntry?.country
    ?? (playersDB ? Object.values(playersDB).find(e => matchesName(e) && e.country)?.country : undefined);
  const flagEmoji = country && country.toUpperCase() !== "PT" ? flagOf(country) : null;

  const titleMsg = hasLink && !hasProfile ? "Federado (perfil limitado — dados do federados.json)" : undefined;
  const inner = (
    <>
      {flagEmoji && (
        <span aria-label={country} title={country} style={{ marginRight: 4, fontSize: "1em", lineHeight: 1 }}>{flagEmoji}</span>
      )}
      {truncName}
      {star && <span className="fs-10 print-hide-star" style={{ marginLeft: 3 }}>⭐</span>}
      {sex && <SexBadge sex={sex} size="sm" className="ml-4" />}
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
      {kidsHash && (
        <a
          href={`/kids#${kidsHash}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver em Kids"
          style={{ marginLeft: 4, fontWeight: 800, color: "var(--color-good-dark)", fontSize: 11, textDecoration: "none" }}>
          ↗
        </a>
      )}
    </>
  );
}
