/**
 * src/data/drive/driveSource.ts — a lista de torneios que a /drive mostra:
 * os resultados dos mensais + inscrições/draws da FPG + os torneios ainda por
 * jogar (sintéticos) + o provisório da Final fundido com o real. Sem React.
 */
import type { Tournament } from "../fpgTypes";
import type { FpgTournamentData } from "../nacional2026Loader";
import { FEATURED_TOURNAMENTS, buildFeaturedSynthetic } from "../featuredTournaments";
import { mergeDrivePlaceholders } from "./driveCircuitData";
import { todayIso } from "../../utils/format";

export type DriveSeries = "tour" | "challenge" | "aquapor";
export type DriveAdmissionsIndex = Map<string, FpgTournamentData>;

/** Pendura as inscrições e os draws da FPG em cada torneio, por `ccode-tcode`.
 *  ⚠ Mexe NOS PRÓPRIOS objectos (de propósito: as «Edições anteriores» e a
 *  lista integral leem os mesmos objectos). */
export function attachDriveAdmissions(raw: Tournament[], idx: DriveAdmissionsIndex): void {
  if (idx.size === 0) return;
  for (const t of raw) {
    const ad = idx.get(`${t.ccode}-${t.tcode}`);
    if (ad) { t._admissions = ad.admissions; t._draws = ad.draws; }
  }
}

/** Nome FPG de um Drive ou AQUAPOR por jogar — `/chall/` como PREFIXO porque os
 *  nomes longos vêm abreviados em pontos arbitrários ("Drive Chall Tejo-…"). */
const DRIVE_RE = /\bdrive\s+(tour\b|chall)/i;
const AQUA_RE = /\baquapor\b/i;

/** Zona Drive pelo nome do torneio. */
export function inferDriveRegion(name: string): string | null {
  if (/madeira/i.test(name)) return "madeira";
  if (/a[çc]ores/i.test(name)) return "acores";
  if (/\bnorte\b/i.test(name)) return "norte";
  if (/\btejo\b/i.test(name)) return "tejo";
  if (/\bsul\b/i.test(name)) return "sul";
  return null;
}

/**
 * Os torneios da /drive (lista nova; os objectos de `raw` entram como estão):
 *  - os FUTUROS entram como sintéticos (só Inscrições/Draw) enquanto não há
 *    resultados nos mensais — (a) pela config `FEATURED_TOURNAMENTS` (séries
 *    tour/challenge/aquapor) e (b) pelo nome em `fpg-admissions-draws.json`;
 *    dedup por ccode/tcode;
 *  - o provisório (lista de apurados, tcode inventado) e o real da FPG do mesmo
 *    dia ficam numa só entrada (`mergeDrivePlaceholders`).
 */
export function buildDriveSource(raw: Tournament[], idx: DriveAdmissionsIndex): Tournament[] {
  let src: Tournament[] = raw;
  if (idx.size > 0) {
    const have = new Set(src.map(t => `${t.ccode}/${t.tcode}`));
    for (const ft of FEATURED_TOURNAMENTS) {
      if (!ft.series || ft.series === "jovens" || ft.series === "clube") continue;  // jovens/clube → FPGPage
      const key = `${ft.ccode}/${ft.tcode}`;
      if (have.has(key)) continue;
      const ad = idx.get(`${ft.ccode}-${ft.tcode}`);
      if (!ad) continue;  // sem dados scraped, a entrada fica dormente
      src = [...src, buildFeaturedSynthetic(ft, ad) as unknown as Tournament];
      have.add(key);
    }
    for (const [, ad] of idx) {
      const key = `${ad.ccode}/${ad.tcode}`;
      if (have.has(key)) continue;
      const name = ad.name || "";
      if (!DRIVE_RE.test(name) && !AQUA_RE.test(name)) continue;
      const ftAuto = {
        ccode: String(ad.ccode),
        tcode: String(ad.tcode),
        series: (AQUA_RE.test(name) ? "aquapor" : /\bchall/i.test(name) ? "challenge" : "tour") as DriveSeries,
        region: inferDriveRegion(name),
      };
      src = [...src, buildFeaturedSynthetic(ftAuto, ad) as unknown as Tournament];
      have.add(key);
    }
  }
  return mergeDrivePlaceholders(src);
}

/** Ano por omissão (decisão B: abrir o mais recente/próximo): o do próximo
 *  torneio, de hoje para a frente; sem nenhum por jogar, o mais recente. Assim
 *  a época seguinte já anunciada (Challenge de Jan/Fev 2027, ainda sem
 *  inscritos, chegou a 30/10/2026) não passa à frente da final que está para vir. */
export function driveDefaultYear(src: Tournament[], today = todayIso()): string | null {
  const datas = src.map(t => t.date || "").filter(Boolean).sort();
  return (datas.find(d => d >= today) ?? datas[datas.length - 1])?.slice(0, 4) ?? null;
}

/** Filtros ao nível do torneio (partilhados por todos os escalões do mesmo dia,
 *  por isso não partem o agrupamento por evento): série, ano e zona. Sem ano,
 *  fica o `driveDefaultYear` depois do filtro da série. */
export function filterDriveSource(
  src: Tournament[],
  f: { series: DriveSeries | "all"; year: string | null; region: string | null },
): Tournament[] {
  let out = src;
  if (f.series !== "all") out = out.filter(t => (t.series || "tour") === f.series);
  const effYear = f.year ?? driveDefaultYear(out);
  if (effYear) out = out.filter(t => (t.date || "").slice(0, 4) === effYear);
  if (f.region) out = out.filter(t => t.region === f.region);
  return out;
}
