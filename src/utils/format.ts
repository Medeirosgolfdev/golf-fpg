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

/** Normaliza texto para comparação.
 *  ⚠ Tem de ESPELHAR o norm() de lib/helpers.js (pipeline) — as chaves de
 *  EC/ECDET/HOLE_STATS em data.json são geradas lá. Em particular, ambos
 *  removem apóstrofos ('/'): sem isso, campos como "Golf Paris Val d'Europe"
 *  falham o lookup e o bloco Eclético desaparece. */
export function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
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

/**
 * Data abreviada com barra — aceita ISO "YYYY-MM-DD" ou "DD-MM-YYYY" → "DD/MM".
 * Se `smartYear` = true, mostra ano quando ≠ ano corrente (ex: "25/03/2023").
 */
export function shortDateSlash(d?: string, smartYear = false): string {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  const [day, mo, yr] = parts[0].length === 4
    ? [parts[2], parts[1], parts[0]]
    : [parts[0], parts[1], parts[2]];
  if (smartYear && yr !== String(new Date().getFullYear())) return `${day}/${mo}/${yr}`;
  return `${day}/${mo}`;
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

/** DOB "2016-09-28" (ISO) → "28/09/2016". Datas noutro formato passam como vieram. */
export function fmtDobPt(dob?: string | null): string | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dob;
}

/** Data "17 Mar 2026" (dia sem zero à esquerda, mês abreviado PT, ano) a partir de ISO. */
export function fmtDayMonthYear(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS_PT[Number(m) - 1] || m} ${y}`;
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

/** Calcula se jogador está no 1º ou 2º ano do escalão, relativo ao ano do torneio
 *  (ou ao ano actual, se não for fornecida data). Regra FPG: idade no ano = year - yearOfBirth.
 *  Sub-N tem dois anos: 1A = (N-1) anos no ano; 2A = N anos no ano (último ano). */
export function anoEscalao(dob: string, escalao: string, dateOrYear?: string | number | null): "1A" | "2A" | null {
  if (!dob) return null;
  const anoNasc = parseInt(String(dob).slice(0, 4));
  const idadeMax = parseInt(String(escalao).replace(/[^0-9]/g, ""));
  if (isNaN(anoNasc) || isNaN(idadeMax)) return null;
  const yearRef = dateOrYear == null
    ? new Date().getFullYear()
    : typeof dateOrYear === "number"
      ? dateOrYear
      : parseInt(String(dateOrYear).slice(0, 4));
  if (isNaN(yearRef)) return null;
  return anoNasc === (yearRef - idadeMax) ? "2A" : "1A";
}

/** Idade completa (em anos) do jogador à data fornecida. Retorna null se inválido.
 *  NOTA: Esta é a idade REAL/exacta, baseada em dias. Para o escalão FPG usa `escalaoAtDate`,
 *  que segue a regra year-based (year − yearOfBirth). */
/** Ano de uma data, aceitando ISO ("2008-07-19", "2008") E o formato das fontes
 *  espanholas/francesas ("19/07/2008"). ⚠ `slice(0,4)` sozinho lia "19/0" como
 *  ano 19 num dob "DD/MM/YYYY" — um miúdo de 18 anos aparecia como "Super
 *  Sénior" na /rfeg (idade 2026−19). Devolve null se não encontrar 4 dígitos. */
function yearOfDate(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s.trim());
  if (dmy) return parseInt(dmy[3], 10);
  const m = /(\d{4})/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}

export function ageAtDate(dob: string | null | undefined, date: string | null | undefined): number | null {
  if (!dob || !date) return null;
  // "19/07/2008" (fontes ES/FR) é Invalid Date em JS → normalizar para ISO antes.
  const iso = (s: string) => {
    const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s.trim());
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
  };
  const d = new Date(iso(dob)), t = new Date(iso(date));
  if (isNaN(+d) || isNaN(+t)) return null;
  let age = t.getFullYear() - d.getFullYear();
  const md = t.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

/** Escalão FPG no ano do torneio, calculado a partir da data de nascimento.
 *
 *  Regra FPG (confirmada): o escalão é atribuído no início do ano civil e mantém-se
 *  durante esse ano. É baseado na **idade que o jogador faz no ano do torneio**, ou seja
 *  `idadeNoAno = anoTorneio − anoNascimento` (NÃO a idade exacta à data do torneio).
 *
 *  Exemplo: jogador nascido em Dezembro de 2015, torneio em Fevereiro de 2026.
 *    idade exacta (errado): 10 anos → "Sub 10" ❌
 *    idadeNoAno FPG:         2026−2015 = 11 → "Sub 12" ✅
 *
 *  Fronteiras (confirmadas empiricamente sobre `federados.json` — 15.050 records
 *  adultos, 100% encaixam sem outliers):
 *    Sub 10 ............ idade ≤ 10
 *    Sub 12 ............ 11–12
 *    Sub 14 ............ 13–14
 *    Sub 16 ............ 15–16
 *    Sub 18 ............ 17–18
 *    Sub 21 ............ 19–21
 *    Sub 24 ............ 22–24
 *    Absoluto .......... 25–49   (FPG: "MidAmateur")
 *    Sénior ............ 50–69   (FPG: "Senior")
 *    Super Sénior ...... 70+     (FPG: "SuperSenior")
 *
 *  `date` pode ser "YYYY-MM-DD", "YYYY", ou um number (ano). Só o ano é usado.
 *  Retorna o escalão como string ou null se inputs inválidos.
 *
 *  ⚠ Esta é a fonte de verdade para a atribuição de escalão. Todos os locais que
 *  mostrem ou filtrem por escalão devem usar esta função com o ano do torneio. */
export function escalaoAtDate(
  dob: string | null | undefined,
  date: string | number | null | undefined
): string | null {
  if (!dob || date == null) return null;
  const anoNasc = yearOfDate(dob);
  const anoTorn = typeof date === "number" ? date : yearOfDate(date);
  if (anoNasc == null || anoTorn == null) return null;
  if (isNaN(anoNasc) || isNaN(anoTorn)) return null;
  const idade = anoTorn - anoNasc;
  if (idade < 0) return null;
  if (idade <= 10) return "Sub 10";
  if (idade <= 12) return "Sub 12";
  if (idade <= 14) return "Sub 14";
  if (idade <= 16) return "Sub 16";
  if (idade <= 18) return "Sub 18";
  if (idade <= 21) return "Sub 21";
  if (idade <= 24) return "Sub 24";
  if (idade <= 49) return "Absoluto";
  if (idade <= 69) return "Sénior";
  return "Super Sénior";
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
const MEDALS = ["🥇", "🥈", "🥉"] as const;

/** Retorna emoji de medalha para posição 1-3, ou null */
export function medal(pos: number): string | null {
  return pos >= 1 && pos <= 3 ? MEDALS[pos - 1] : null;
}

/* ═══════ Deep-link canónico de torneios ═══════
 * URL schema: `/<base>/torneio/<ccode>-<tcode>`
 *   - FPGPage:   /FPG/torneio/007-99012
 *   - DrivePage: /drive/torneio/988-10301
 *
 * `tkey` é a combinação `{ccode}-{tcode}` que serve de identificador único
 * canónico para qualquer torneio da app. Multi-dia (tcode com "+") aceite
 * mas tratado como string opaca — usa o primeiro tcode para lookup.
 */

/** Gera o `tkey` canónico de um torneio: "{ccode}-{tcode}". */
function tournamentKey(ccode: string | null | undefined, tcode: string | null | undefined): string {
  const cc = String(ccode || "").trim();
  const tc = String(tcode || "").trim();
  if (!cc || !tc) return "";
  return `${cc}-${tc}`;
}

/** Parse de um `tkey` URL-safe em ccode/tcode. O primeiro "-" separa
 *  ccode de tcode (ccode é sempre numérico/3 chars, não contém "-"). */
export function parseTournKey(tkey: string | null | undefined): { ccode: string; tcode: string } | null {
  if (!tkey) return null;
  const s = String(tkey);
  const i = s.indexOf("-");
  if (i <= 0 || i === s.length - 1) return null;
  return { ccode: s.slice(0, i), tcode: s.slice(i + 1) };
}

/** URL canónica para deep-link de torneio. `base` é o prefixo da página
 *  ("FPG" ou "drive"). Retorna string vazia se faltar ccode ou tcode. */
export function tournamentUrl(base: "FPG" | "drive", ccode: string | null | undefined, tcode: string | null | undefined): string {
  const key = tournamentKey(ccode, tcode);
  if (!key) return "";
  return `/${base}/torneio/${key}`;
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

/** URL directa das inscrições (tournAdmissions.aspx) no scoring.fpg.pt */
export function fpgAdmissionsUrl(ccode: string, tcode: string): string {
  const [cc, tc] = fpgClean(ccode, tcode);
  return `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${cc}&tcode=${tc}`;
}
