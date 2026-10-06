// Clock time at the garden's location for the sun in the forest-garden plan:
// the time zone comes from the plan's coordinates (offline lookup,
// @photostructure/tz-lookup, CC0, loaded only when needed), so 14:00 means
// 14:00 local time there — summer time included — whatever zone the browser
// is in. Plans without a location use the browser's zone.

/** The browser's own IANA zone, e.g. "Europe/Berlin". */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const zoneCache = new Map<string, string>();

/** IANA time zone at a location; the browser's zone when the lookup fails. */
export async function timeZoneAt(lat: number, lon: number): Promise<string> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = zoneCache.get(key);
  if (hit) return hit;
  let zone = browserTimeZone();
  try {
    const { default: tzlookup } = await import('@photostructure/tz-lookup');
    zone = tzlookup(lat, lon) || zone;
  } catch { /* offline chunk missing or bad coordinates: keep the browser's zone */ }
  zoneCache.set(key, zone);
  return zone;
}

export interface WallClock { y: number; m: number; d: number; h: number; min: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Date and time on the clocks in `tz` at this instant (m = 1–12). */
export function wallClock(date: Date, tz: string): WallClock {
  const p: Record<string, number> = {};
  for (const part of fmt(tz).formatToParts(date)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute };
}

/** Offset of `tz` from UTC at this instant, in minutes (Berlin in summer: 120). */
export function zoneOffsetMin(date: Date, tz: string): number {
  const w = wallClock(date, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/**
 * The instant at which the clocks in `tz` show this date and time (m = 1–12).
 * In the hour skipped by the spring change it lands an hour later; in the
 * doubled autumn hour it takes the first one.
 */
export function zonedDate(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const asUtc = Date.UTC(y, m - 1, d, h, min);
  let t = asUtc - zoneOffsetMin(new Date(asUtc), tz) * 60000;
  // The offset at the result can differ (near a change): correct once.
  const off2 = zoneOffsetMin(new Date(t), tz);
  t = asUtc - off2 * 60000;
  return new Date(t);
}

/** Short name of the zone at this instant, e.g. "MESZ" / "CEST", or "GMT+1". */
export function timeZoneLabel(date: Date, tz: string, lang: string): string {
  const part = new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName');
  return part?.value ?? tz;
}
