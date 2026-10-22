/**
 * src/data/model/identity.ts — identidade de um jogador (sexo, país ISO,
 * nascimento, escalão) num só formato, para todas as fontes.
 *
 * Cada conversor já guardava estes dados, cada um à sua maneira: `_sex`/`sex`,
 * `country`/`nat`/`pais` (nome, ISO-2, ISO-3 ou COI), `dob` em ISO ou
 * DD/MM/AAAA, `birthYear`, `escalao` em várias grafias. `playerIdentity` lê
 * tudo isso e devolve `PlayerIdentity`; `enrichPlayerIdentity` grava-o em
 * `identity` ao lado dos campos antigos (que continuam a ser os que a
 * interface lê — nada muda no ecrã). O que a fonte não diz fica null: nunca
 * se adivinha (um ano de nascimento ESTIMADO não entra).
 */
import { normCountry } from "../../utils/flagUtils";
import type { PlayerIdentity } from "./types";
import { escalaoCanon } from "./escalao";

/** O que se sabe do jogador fora da linha (divisão, base de jogadores). */
export interface IdentityContext {
  /** Sexo da divisão (só M/F — «Mixed» não diz nada do jogador). */
  sex?: string | null;
  /** Escalão da divisão (quando a linha não traz o seu). */
  escalao?: string | null;
  /** País de todos os jogadores da fonte, quando ela só tem de um país. */
  country?: string | null;
  /** Base por federado (FPG): sexo, nascimento, país, escalão. */
  byFed?: Record<string, { sex?: string | null; dob?: string | null; country?: string | null; escalao?: string | null } | undefined>;
  /** Fonte do escalão, para os nomes ambíguos (ver `escalaoCanon`). */
  escalaoSource?: "fpg" | "ffg" | "es" | "uskids";
}

/** «M»/«F» a partir de M, F, Male, Female, Masculino, Feminino, Boys, Girls… */
export function sexOf(raw: unknown): "M" | "F" | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(m|h|male|masc|masculino|masculin|men|homens?|hommes?|boys?|gar[cç]ons?|messieurs)$/.test(s)) return "M";
  if (/^(f|w|female|fem|feminino|f[eé]minin|women|senhoras|damas?|dames|girls?|filles)$/.test(s)) return "F";
  return null;
}

/** País → ISO-3166 alfa-2 em maiúsculas. Aceita nome (PT/EN), ISO-2, ISO-3 e
 *  os códigos COI que as fontes usam (POR, GER, SUI, NED…). Sem país → null. */
export function countryIsoOf(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^(nn|xx|@\d|\?|-|n\/a)$/i.test(s)) return null;
  if (/^(pt|prt|por)$/i.test(s) || /^portugal$/i.test(s)) return "PT";
  const sub = /^gb[-_](eng|sct|wls|nir)$/i.exec(s);
  if (sub) return `GB-${sub[1].toUpperCase()}`;
  const code = normCountry(s);
  return /^[a-z]{2}$/.test(code) ? code.toUpperCase() : null;
}

/** Data de nascimento em ISO (AAAA-MM-DD) a partir de ISO, DD/MM/AAAA ou
 *  DD-MM-AAAA. Outra coisa → null. */
export function dobIso(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Ano de nascimento plausível (1900..2100) ou null. */
const yearOk = (y: unknown): number | null => {
  const n = typeof y === "number" ? y : typeof y === "string" && /^\d{4}$/.test(y.trim()) ? +y : NaN;
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
};

type Rec = Record<string, unknown>;
const first = (p: Rec, keys: string[]): unknown => {
  for (const k of keys) if (p[k] != null && p[k] !== "") return p[k];
  return undefined;
};

/** A identidade de um jogador a partir dos campos que os conversores já
 *  gravam (e do contexto da divisão/base). */
export function playerIdentity(player: object, ctx: IdentityContext = {}): PlayerIdentity {
  const p = player as Rec;
  const fed = String(first(p, ["fed", "fedCode"]) ?? "").trim();
  const db = fed ? ctx.byFed?.[fed] : undefined;
  const sex = sexOf(first(p, ["_sex", "sex", "gender", "sexo"])) ?? sexOf(db?.sex) ?? sexOf(ctx.sex);
  const countryIso = countryIsoOf(first(p, ["country", "_country", "countryCode", "nat", "nationality", "pais", "país"]))
    ?? countryIsoOf(db?.country) ?? countryIsoOf(ctx.country);
  const dob = dobIso(first(p, ["dob", "_dob", "birthDate", "dataNascimento"])) ?? dobIso(db?.dob);
  const birthYear = dob ? +dob.slice(0, 4) : yearOk(first(p, ["birthYear", "_birthYear", "anoNascimento"]));
  const escRaw = first(p, ["escalao", "_escalao", "category", "categoria"]) ?? db?.escalao ?? ctx.escalao;
  const escalao = escRaw != null ? escalaoCanon(String(escRaw), ctx.escalaoSource) : null;
  return { sex, countryIso, dob, birthYear, escalao };
}

/** Os jogadores com `identity` preenchida (objectos novos; os originais ficam
 *  intactos — podem vir da cache de fetch, que é só de leitura). */
export function enrichPlayerIdentity<P extends object>(players: readonly P[], ctx: IdentityContext = {}): (P & { identity: PlayerIdentity })[] {
  return players.map((p) => ({ ...p, identity: playerIdentity(p, ctx) }));
}
