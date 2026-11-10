/**
 * src/utils/teeChoice.ts — escolher UM tee numa caixa de escolha, num URL ou no
 * localStorage (10/11/2026).
 *
 * O `teeId` sozinho NÃO identifica um tee: nos campos do master há 27 pares em
 * que o tee de Homens e o de Senhoras têm o MESMO `teeId` (ex.: Praia d'El-Rey,
 * «Amarelas»: M 70,3/123 · F 76,1/131). Quem escolhia pelo `teeId` ficava sempre
 * com o primeiro (o de Homens). A chave de escolha é `teeId + sexo`, que é única
 * dentro de um campo — e, como o `teeId` traz o campo, não serve noutro campo.
 *
 * Usar SEMPRE estas funções quando o utilizador escolhe um tee.
 */
import type { Tee } from "../data/types";
import { physicalTeeGroups } from "./teeGroups";

const SEP = "|";
const SEX_MARK: Record<string, string> = { M: " · M", F: " · F" };

/** Chave de escolha de um tee: `teeId|sexo`. */
export function teeChoiceKey(t: Pick<Tee, "teeId" | "sex">): string {
  return `${t.teeId}${SEP}${t.sex}`;
}

/** É uma chave de escolha (e não um `teeId` solto ou um índice antigo)? */
export function isTeeChoiceKey(key: string | null | undefined): key is string {
  return !!key && key.includes(SEP);
}

/**
 * O tee de uma chave de escolha. Só casa pela chave inteira; um `teeId` solto
 * (links antigos) só é aceite quando esse `teeId` é de UM tee — nunca se escolhe
 * um dos dois sexos ao calhas.
 */
export function findTeeByChoice(tees: readonly Tee[], key: string | null | undefined): Tee | undefined {
  if (!key) return undefined;
  const exacto = tees.find((t) => teeChoiceKey(t) === key);
  if (exacto || isTeeChoiceKey(key)) return exacto;
  const porId = tees.filter((t) => t.teeId === key);
  return porId.length === 1 ? porId[0] : undefined;
}

export interface TeeChoiceOption { key: string; label: string; tee: Tee }

/**
 * Opções para uma caixa de escolha de tee: uma por tee FÍSICO; quando o mesmo
 * tee tem ratings de Homens e de Senhoras, uma por sexo, com « · M»/« · F» no
 * texto. O `key` é a chave de escolha (o `value` da opção).
 */
export function teeChoiceOptions(tees: Tee[]): TeeChoiceOption[] {
  const opts: TeeChoiceOption[] = [];
  for (const g of physicalTeeGroups(tees)) {
    const sexes = (["M", "F", "U"] as const).filter((s) => g.teeBySex[s]);
    const multi = sexes.length > 1;
    for (const s of sexes) {
      const t = g.teeBySex[s]!;
      opts.push({ key: teeChoiceKey(t), label: g.label + (multi ? (SEX_MARK[s] ?? "") : ""), tee: t });
    }
  }
  return opts;
}
