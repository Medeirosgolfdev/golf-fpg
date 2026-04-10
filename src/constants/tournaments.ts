/**
 * constants/tournaments.ts
 *
 * Configuração de torneios nacionais FPG.
 * Antes: TORNEIOS_CONFIG duplicado em FPGPage e NacionaisPage.
 */

export interface TorneioConfig {
  tcode: string;
  nome: string;
  escalao: string;
  sex: "M" | "F";
}

/** Torneios do circuito nacional juvenil FPG (Sub-10 a Sub-18, H e S) */
export const TORNEIOS_CONFIG: TorneioConfig[] = [
  { tcode: "10935", nome: "Sub-18 H", escalao: "Sub-18", sex: "M" },
  { tcode: "10936", nome: "Sub-18 S", escalao: "Sub-18", sex: "F" },
  { tcode: "10937", nome: "Sub-16 H", escalao: "Sub-16", sex: "M" },
  { tcode: "10938", nome: "Sub-16 S", escalao: "Sub-16", sex: "F" },
  { tcode: "10939", nome: "Sub-14 H", escalao: "Sub-14", sex: "M" },
  { tcode: "10940", nome: "Sub-14 S", escalao: "Sub-14", sex: "F" },
  { tcode: "10941", nome: "Sub-12 H", escalao: "Sub-12", sex: "M" },
  { tcode: "10942", nome: "Sub-12 S", escalao: "Sub-12", sex: "F" },
  { tcode: "10943", nome: "Sub-10 H", escalao: "Sub-10", sex: "M" },
  { tcode: "10944", nome: "Sub-10 S", escalao: "Sub-10", sex: "F" },
];
