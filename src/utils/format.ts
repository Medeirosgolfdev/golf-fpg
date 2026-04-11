const ptFmt = new Intl.NumberFormat("pt-PT");

/** Formata número ou "—" */
export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return ptFmt.format(n);
}

/** Formata CR com 1 decimal e vírgula PT */
export function fmtCR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1).replace(".", ",");
}

/** Normaliza texto para comparação */
export function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Title case: capitaliza cada palavra */
export function titleCase(s: string): string {
  const x = (s ?? "").trim();
  if (!x) return x;
  return x.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Soma um range de valores com getter */
export function sumRange(from: number, to: number, getVal: (i: number) => number | null): number | null {
  let sum = 0;
  let any = false;
  for (let i = from; i <= to; i++) {
    const v = getVal(i);
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Data abreviada: "25-03-2024" → "25-03" */
export function shortDate(d: string): string {
  return (d || "").replace(/^(\d{2})-(\d{2})-\d{4}$/, "$1-$2");
}

/* ── Delta formatters (signed, fixed decimals) ── */

/** +1.5 / -2.3 / E (1 decimal) */
export function fD(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

/** +1.50 / -2.30 (2 decimals) */
export function fD2(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

/* ── Name helpers ── */

/** "Manuel Medeiros" → "Manuel" */
export function firstName(name: string): string {
  return (name || "").split(" ")[0];
}

/** "Manuel Henrique Medeiros" → "Manuel Henrique" */
export function shortName(name: string): string {
  return (name || "").split(" ").slice(0, 2).join(" ");
}

/** "Manuel Henrique Goulartt Medeiros" → "Manuel H. G. Medeiros" (se > maxLen) */
export function abreviarNome(nome: string, maxLen = 25): string {
  if (!nome || nome.length <= maxLen) return nome;
  const parts = nome.trim().split(/\s+/);
  if (parts.length <= 2) return nome;
  const primeiro = parts[0];
  const ultimo = parts[parts.length - 1];
  const meios = parts.slice(1, -1).map(p => p[0] + ".").join(" ");
  const abrev = primeiro + " " + meios + " " + ultimo;
  return abrev.length < nome.length ? abrev : nome;
}

/** Meses abreviados em português */
export const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"] as const;

/** Normaliza uma string de data para ISO (YYYY-MM-DD).
 *  Aceita "YYYY-MM-DD" (passa), "MM/DD/YYYY" (US), "DD-MM-YYYY" */
export function isoDate(s: string): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split("/");
  if (parts.length === 3 && parts[2].length === 4)
    return `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
  return s;
}

/** Formata data curta: "17/03" (dd/mm sem ano). Útil para colunas compactas. */
export function fmtDateShort(s: string): string {
  if (!s) return "";
  const [, m, day] = s.split("-");
  if (!m || !day) return s;
  return `${day}/${m}`;
}

/** Formata chave "YYYY-MM" → "Jan 2025". Aceita "?" e anos de 4 dígitos. */
export function monthLabel(key: string): string {
  if (!key || key === "?") return "Data desconhecida";
  if (key.length === 4) return key;
  const [yr, mo] = key.split("-");
  return `${MONTHS_PT[parseInt(mo) - 1] || mo} ${yr}`;
}

/** Formata chip de torneio: "21 field · 3R · Boys 10-11" */
export function fmtFieldInfo(fieldSize: number, nRounds: number, category: string): string {
  return `${fieldSize} field · ${nRounds}R · ${category}`;
}

/** Formata data para exibição: "17 mar. 2026"
 *  Aceita ISO, MM/DD/YYYY ou DD-MM-YYYY */
export function fmtDate(s: string): string {
  if (!s) return "";
  const iso = isoDate(s);
  if (!iso) return s;
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

/** Formata to-par: +5, -2, E */
export function fmtToPar(tp: number | null | undefined, placeholder = "—"): string {
  if (tp == null || !Number.isFinite(tp)) return placeholder;
  if (tp === 0) return "E";
  return tp > 0 ? `+${tp}` : `${tp}`;
}

/** Formata handicap: +2.3, -1.0, 0.0 */
export function fmtHcp(hcp: number | null | undefined, placeholder = "—"): string {
  if (hcp == null || !Number.isFinite(hcp)) return placeholder;
  const s = Math.abs(hcp).toFixed(1);
  return hcp < 0 ? `+${s}` : hcp > 0 ? s : `0.0`;
}

/** Formata Score Differential: +1.2, -3.5 */
export function fmtSD(sd: number | null | undefined, placeholder = "—"): string {
  if (sd == null || !Number.isFinite(sd)) return placeholder;
  return sd >= 0 ? `+${sd.toFixed(1)}` : sd.toFixed(1);
}

/** Número com sinal explícito: "+5", "0", "-3". Com decimais: fmtSign(1.5, 1) → "+1.5" */
export function fmtSign(n: number, decimals?: number): string {
  const s = decimals != null ? n.toFixed(decimals) : String(n);
  return n > 0 ? `+${s}` : s;
}

/** Número com sinal e parênteses: "(E)" / "(+3)" / "(-2)". Usado para subtotais F9/B9. */
export function fmtSignParen(n: number): string {
  if (n === 0) return "(E)";
  return n > 0 ? `(+${n})` : `(${n})`;
}

/** Ícone de seta de ordenação: " ↑" / " ↓" / "" */
export function sortArrow(col: string, activeCol: string, dir: "asc" | "desc"): string {
  return col === activeCol ? (dir === "asc" ? " ↑" : " ↓") : "";
}

/** Meses PT por extenso (lowercase): "janeiro", "fevereiro", ... */
export const MONTHS_PT_FULL = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
] as const;

/** Meses PT por extenso (Title Case): "Janeiro", "Fevereiro", ... */
export const MONTHS_PT_LONG = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
] as const;

/** Map abreviatura → índice 0-based (pt+en): jan→0, fev→1, feb→1, etc. */
export const MONTH_MAP: Record<string, number> = {
  jan:0,fev:1,feb:1,mar:2,abr:3,apr:3,mai:4,may:4,jun:5,
  jul:6,ago:7,aug:7,set:8,sep:8,out:9,oct:9,nov:10,dez:11,dec:11,
};

/** "Sub-14" → "S14" */
export function escShort(esc: string): string { return esc.replace("Sub-", "S"); }

/** ISO timestamp → "HH:MM" (PT locale) */
export function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

/** Data de inscrição sem o ano: "2026/03/15" → "03/15" */
export function fmtDataInscricao(s: string | null): string {
  if (!s) return "–";
  return s.replace(/^\d{4}\//, "").replace("/", "/");
}

/** Calcula se jogador está no 1º ou 2º ano do escalão */
export function anoEscalao(dob: string, escalao: string): "1A" | "2A" | null {
  if (!dob) return null;
  const anoNasc = parseInt(dob.slice(0, 4));
  const idadeMax = parseInt(escalao.replace("Sub-", ""));
  if (isNaN(anoNasc) || isNaN(idadeMax)) return null;
  return anoNasc === (new Date().getFullYear() - idadeMax) ? "2A" : "1A";
}

/* ═══════ Name Display ═══════ */

/** Partículas que ficam em minúsculas no meio de nomes (de, da, van, etc.) */
const PARTICLES = new Set(['de','da','do','dos','das','di','del','van','von','den','der','ter','le','la','el','al','y','e']);

/**
 * Normaliza nomes para display: detecta ALL CAPS (>45% maiúsculas) e converte
 * para Title Case respeitando partículas. Nomes normais ficam intocados.
 */
export function displayName(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  const letters = clean.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, '');
  const isAllCaps = letters.length > 2 && upper.length / letters.length > 0.45;
  if (!isAllCaps) {
    return clean.split(' ').map((w, i) =>
      i > 0 && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w
    ).join(' ');
  }
  return clean.toLowerCase().split(' ').map((w, i) => {
    if (i > 0 && PARTICLES.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/* ═══════ Medals ═══════ */

/** Emojis de medalha por posição (0-indexed: [0]=🥇, [1]=🥈, [2]=🥉) */
export const MEDALS = ["🥇", "🥈", "🥉"] as const;

/** Retorna emoji de medalha para posição 1-3, ou null */
export function medal(pos: number): string | null {
  return pos >= 1 && pos <= 3 ? MEDALS[pos - 1] : null;
}

/* ═══════ FPG Tournament URLs ═══════ */

const FPG_ACK = "XH256YF45T";

/** Limpa ccode/tcode para URLs FPG */
function fpgClean(ccode: string, tcode: string): [string, string] {
  return [
    String(ccode || "").padStart(3, "0"),
    String(tcode || "").replace(/_R\d+$|_Total$/, ""),
  ];
}

/** URL do draw (emparelhamentos) no scoring.fpg.pt */
export function fpgDrawUrl(ccode: string, tcode: string, round = 1): string {
  const [cc, tc] = fpgClean(ccode, tcode);
  return `https://scoring.fpg.pt/lists/linkpage.aspx?page=draw&club=${cc}&tourn=${tc}&round=${round}&ack=${FPG_ACK}`;
}

/** URL da classificação no scoring.fpg.pt */
export function fpgScoringUrl(ccode: string, tcode: string): string {
  const [cc, tc] = fpgClean(ccode, tcode);
  return `https://scoring.fpg.pt/lists/linkpage.aspx?page=classif&club=${cc}&tourn=${tc}&ack=${FPG_ACK}`;
}

/** URL da classificação no scoring.datagolf.pt (legacy, usado no DrivePage) */
export function fpgDatagolfUrl(ccode: string, tcode: string): string {
  const [cc, tc] = fpgClean(ccode, tcode);
  return `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${cc}&tcode=${tc}`;
}
