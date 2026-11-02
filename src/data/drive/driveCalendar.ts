/**
 * src/data/drive/driveCalendar.ts — o calendário da época de uma série do Drive
 * (decisão E, 22/10/2026): sai dos DADOS — os torneios da /drive (resultados dos
 * mensais + os por jogar das inscrições da FPG, `buildDriveSource`), um por
 * evento — em vez da lista escrita à mão. Sem React.
 *
 * «Hoje» é o dia em Lisboa (`todayIso`); o estado (passado/próximo) calcula-se
 * na página com `calendarStatus`.
 */
import type { Tournament } from "../fpgTypes";
import { buildDriveEntries, shortCampo } from "./driveCircuitData";
import { filterDriveSource, type DriveSeries } from "./driveSource";
import { DRIVE_REGION_LABEL } from "./driveRegions";

export interface DriveCalEntry {
  /** «1º DT Sul», «Final DC Madeira», «3º AQUAPOR». */
  name: string;
  /** AAAA-MM-DD. */
  date: string;
  /** Último dia (provas de várias voltas). */
  endDate?: string;
  campo: string;
  region: string;
  series: DriveSeries;
  /** Por jogar: os federados inscritos e o estado das inscrições (da FPG). */
  inscritos?: string[];
  estado?: string;
}

const PREFIX: Record<DriveSeries, string> = { tour: "DT", challenge: "DC", aquapor: "AQUAPOR" };

/** AAAA-MM-DD + n dias. */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Etiqueta curta de um evento: ordem (do nome) + série + zona. */
export function driveCalLabel(name: string, series: DriveSeries, region: string | null | undefined): string {
  const n = /(\d+)\s*º/.exec(name)?.[1];
  const ord = /\bfinal\b/i.test(name) ? (/nacional/i.test(name) ? "Final Nacional" : "Final") : n ? `${n}º` : "";
  const zona = series === "aquapor" || !region || region === "nacional" ? "" : DRIVE_REGION_LABEL[region] ?? region;
  return [ord, PREFIX[series], zona].filter(Boolean).join(" ");
}

/** Os eventos de uma série num ano, por data. */
export function driveCalendar(src: Tournament[], series: DriveSeries, year: string): DriveCalEntry[] {
  const ents = buildDriveEntries(filterDriveSource(src, { series, year, region: null }));
  return ents
    .filter(e => e.dateStart)
    .map((e): DriveCalEntry => {
      const date = e.dateStart!;
      const n = Math.max(1, e.roundsCount ?? 1);
      // Inscritos de todas as divisões (um Challenge tem uma por escalão).
      const ads = (e.divisions ?? []).flatMap(d => d.results?._admissions ? [d.results._admissions] : []);
      const inscritos = ads.flatMap(a => (a.players ?? []).map(p => String(p.fed ?? ""))).filter(Boolean);
      return {
        name: driveCalLabel(e.name, series, e.liga),
        date,
        ...(e.dateEnd && e.dateEnd !== date ? { endDate: e.dateEnd } : n > 1 ? { endDate: addDays(date, n - 1) } : {}),
        campo: shortCampo(e.course),
        region: e.liga || "nacional",
        series,
        ...(inscritos.length ? { inscritos } : {}),
        ...(ads[0]?.status ? { estado: ads[0].status } : {}),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Passado / próximo (o 1.º que ainda não acabou) / futuro, em relação a hoje. */
export function calendarStatus(entries: DriveCalEntry[], today: string): ("past" | "next" | "future")[] {
  let nextGiven = false;
  return entries.map(e => {
    if ((e.endDate || e.date) < today) return "past";
    if (!nextGiven) { nextGiven = true; return "next"; }
    return "future";
  });
}
