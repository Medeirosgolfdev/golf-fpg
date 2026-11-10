/**
 * src/utils/federadoPorNome.ts — dar um federado a alguém de quem só se sabe o
 * NOME (10/11/2026). Regra do projecto (03/11/2026): nunca adivinhar por nome —
 * um homónimo recebe a ficha, a data de nascimento e o escalão de outra pessoa.
 *
 * Só se devolve um federado quando, entre TODOS os homónimos conhecidos:
 *   1. a pessoa não vem marcada com um país estrangeiro;
 *   2. saem os que a própria prova exclui pela idade (num «Sub 10» não entra
 *      quem faz mais de 10 anos nesse ano);
 *   3. sobra UM (nome único), ou o clube aponta para UM só.
 * Em qualquer outro caso: `null` (fica sem federado — não se escolhe o primeiro).
 */
import { norm } from "./format";
import { isPtCountry } from "./flagUtils";
import { clubeEhPais } from "./clubePais";

export interface CandidatoFederado {
  fed: string;
  /** Nascimento (AAAA-MM-DD, ou qualquer texto com o ano de 4 dígitos). */
  dob?: string | null;
  /** Clube + sigla, já normalizados com `norm`. */
  clubNorm?: string;
}

export interface PistaFederado {
  /** Clube tal como vem na prova («Santo da Serra»). */
  clube?: string | null;
  /** País tal como vem na prova; vazio = prova nacional. */
  pais?: string | null;
  /** Nome da prova — dá o escalão («… Sub 10»). */
  torneioNome?: string | null;
  /** Data da prova (AAAA-MM-DD). */
  data?: string | null;
}

/** O maior «Sub N» escrito no nome de uma prova («Sub10», «Sub-12 e Sub-14» → 14); sem escalão → null. */
export function subNDoNome(nome: string | null | undefined): number | null {
  const ns = [...String(nome ?? "").matchAll(/\bsub[\s.-]*(\d{1,2})\b/gi)].map((m) => parseInt(m[1], 10));
  return ns.length ? Math.max(...ns) : null;
}

const anoDe = (s: string | null | undefined): number | null => {
  const m = /(\d{4})/.exec(String(s ?? ""));
  return m ? parseInt(m[1], 10) : null;
};

const palavras = (s: string) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * O clube da prova cabe no clube do federado? Por PALAVRAS inteiras («Sul» não
 * casa com «Península»). Não conta: vazio, menos de 3 letras («-»), nem um
 * «clube» que é só o código do país («POR», «UK» — `clubeEhPais`).
 */
export function clubeCompativel(clubeDaProva: string | null | undefined, clubNorm: string | undefined): boolean {
  if (!clubNorm || clubeEhPais(clubeDaProva)) return false;
  const cc = palavras(clubeDaProva || "");
  if (cc.replace(/ /g, "").length < 3) return false;
  return ` ${palavras(clubNorm)} `.includes(` ${cc} `);
}

/**
 * Escolhe o federado de entre os homónimos — ou nenhum. `candidatos` são TODOS
 * os federados com aquele nome (um por federado).
 */
export function federadoPorNome<T extends CandidatoFederado>(candidatos: readonly T[], pista: PistaFederado = {}): T | null {
  if (!candidatos.length) return null;
  if (pista.pais && !isPtCountry(pista.pais)) return null;
  const subN = subNDoNome(pista.torneioNome);
  const anoProva = anoDe(pista.data);
  const possiveis = subN != null && anoProva != null
    ? candidatos.filter((c) => { const a = anoDe(c.dob); return a == null || anoProva - a <= subN; })
    : candidatos;
  if (possiveis.length === 1) return possiveis[0];
  if (possiveis.length === 0) return null;
  const doClube = possiveis.filter((c) => clubeCompativel(pista.clube, c.clubNorm));
  return doClube.length === 1 ? doClube[0] : null;
}
