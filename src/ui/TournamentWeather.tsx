/**
 * src/ui/TournamentWeather.tsx
 *
 * Strip de meteorologia por dia para o cabeçalho de um torneio. Drop-in
 * partilhado por todas as páginas de torneios (CircuitShell + headers à parte).
 *
 * Dados: public/data/weather.json (gerado por scripts/fetch-weather.js).
 *   {
 *     places: { "<courseKey>": { lat, lon, label, precision: "course"|"city"|"country" } },
 *     days:   { "<lat>,<lon>|<YYYY-MM-DD>": { code, tmax, tmin, prcp, wind, wdir } }
 *   }
 *
 * O componente é READ-ONLY e defensivo: se não houver dados (ficheiro ausente,
 * campo não geocodificado, ou dias por buscar) renderiza `null` — por isso é
 * seguro deixá-lo em qualquer header desde já; "acende" quando o script correr.
 *
 * Fonte: Open-Meteo Historical Weather API (https://open-meteo.com) — gratuita,
 * sem chave, dados desde 1940. Links de consulta no fim da strip.
 */
import { useEffect, useState } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import ExtLink from "./ExternalLink";

const WEATHER_URL = "/data/weather.json";

interface WxDay { code: number; tmax: number; tmin: number; prcp: number; wind: number; wdir?: number }
interface WxPlace { lat: number; lon: number; label?: string; precision?: "course" | "city" | "country" }
interface WeatherFile {
  places?: Record<string, WxPlace>;
  days?: Record<string, WxDay>;
}

/** Normalização de nome de campo — TEM de espelhar a do scripts/fetch-weather.js. */
function normCourseKey(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** WMO weathercode → ícone + rótulo PT. */
function wmo(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Céu limpo" };
  if (code === 1) return { icon: "🌤️", label: "Pouco nublado" };
  if (code === 2) return { icon: "⛅", label: "Parcialmente nublado" };
  if (code === 3) return { icon: "☁️", label: "Nublado" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Nevoeiro" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Chuvisco" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Chuva" };
  if (code >= 71 && code <= 77) return { icon: "❄️", label: "Neve" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Aguaceiros" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "Aguaceiros de neve" };
  if (code >= 95) return { icon: "⛈️", label: "Trovoada" };
  return { icon: "🌡️", label: "—" };
}

/** Parse "YYYY-MM-DD" ou "DD/MM/YYYY" → Date UTC, ou null. */
function parseISO(s?: string | null): Date | null {
  if (!s) return null;
  let m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
function isoOf(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

/** Datas das rondas: start + 0..n−1 dias (rondas consecutivas). */
function roundDates(start?: string | null, end?: string | null, rounds?: number): string[] {
  const s = parseISO(start);
  if (!s) return [];
  let n = rounds && rounds > 0 ? rounds : 0;
  if (!n) {
    const e = parseISO(end);
    n = e ? Math.round((e.getTime() - s.getTime()) / 86400000) + 1 : 1;
  }
  n = Math.max(1, Math.min(n, 8)); // segurança
  return Array.from({ length: n }, (_, i) => isoOf(addDays(s, i)));
}

const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function dowLabel(iso: string): string {
  const d = parseISO(iso);
  return d ? DOW_PT[d.getUTCDay()] : "";
}

export default function TournamentWeather({
  course, startDate, endDate, rounds,
}: {
  course?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  rounds?: number;
}) {
  const [wx, setWx] = useState<WeatherFile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    cachedFetchJson<WeatherFile>(WEATHER_URL)
      .then((d) => { if (alive) { setWx(d); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  if (!loaded || !wx || !course || !startDate) return null;

  const place = wx.places?.[normCourseKey(course)];
  if (!place) return null;

  const dates = roundDates(startDate, endDate, rounds);
  if (!dates.length) return null;

  const days = dates
    .map((date) => ({ date, wx: wx.days?.[`${place.lat},${place.lon}|${date}`] }))
    .filter((x): x is { date: string; wx: WxDay } => !!x.wx);
  if (!days.length) return null;

  const first = dates[0];
  const last = dates[dates.length - 1];
  const omLink =
    `https://open-meteo.com/en/docs/historical-weather-api#latitude=${place.lat}&longitude=${place.lon}` +
    `&start_date=${first}&end_date=${last}&hourly=&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max`;
  const mbLink = `https://www.meteoblue.com/en/weather/week/${place.lat}N${place.lon}E`;
  const windyLink = `https://www.windy.com/${place.lat}/${place.lon}?${place.lat},${place.lon},9`;

  const approx = place.precision && place.precision !== "course";

  return (
    <div
      className="tourn-weather gap-4"
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", marginTop: 6, rowGap: 4 }}
    >
      <span className="c-muted fs-11" style={{ fontWeight: 600 }}>
        Tempo{approx ? "*" : ""}:
      </span>
      {days.map(({ date, wx: d }) => {
        const w = wmo(d.code);
        return (
          <span
            key={date}
            className="p p-sm"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "var(--bg-muted)", color: "var(--text-2)",
              border: "1px solid var(--border)", whiteSpace: "nowrap",
            }}
            title={
              `${dowLabel(date)} ${date} — ${w.label}\n` +
              `Temp: ${Math.round(d.tmin)}–${Math.round(d.tmax)} °C\n` +
              `Vento: ${Math.round(d.wind)} km/h\n` +
              `Precipitação: ${d.prcp.toFixed(1)} mm`
            }
          >
            <span className="c-muted fs-10">{dowLabel(date)}</span>
            <span style={{ fontSize: "var(--fs-13)" }}>{w.icon}</span>
            <span>{Math.round(d.tmax)}°</span>
            <span className="c-muted fs-10">💨{Math.round(d.wind)}</span>
            {d.prcp >= 0.2 && <span className="c-muted fs-10">🌧{d.prcp.toFixed(d.prcp < 1 ? 1 : 0)}</span>}
          </span>
        );
      })}
      <span className="fs-10 c-muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <ExtLink href={omLink} className="tourn-ext-link" title="Open-Meteo (fonte dos dados)">Open-Meteo ↗</ExtLink>
        <ExtLink href={mbLink} className="tourn-ext-link" title="Meteoblue">Meteoblue ↗</ExtLink>
        <ExtLink href={windyLink} className="tourn-ext-link" title="Windy">Windy ↗</ExtLink>
      </span>
      {approx && (
        <span className="fs-10 c-muted" title={place.label || ""}>
          *aprox. ({place.label || place.precision})
        </span>
      )}
    </div>
  );
}
