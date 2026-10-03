// Sun position for the 3D garden view — the core of SunCalc
// (https://github.com/mourner/suncalc, © Vladimir Agafonkin, BSD-2-Clause),
// trimmed to what the shadow/sun-path display needs. Accurate to well under
// a degree, plenty for "where does the shadow fall at 4 pm in June".

const RAD = Math.PI / 180;
const DAY_MS = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;

function sunCoords(d: number) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return {
    dec: Math.asin(Math.sin(OBLIQUITY) * Math.sin(L)),
    ra: Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L)),
  };
}

/** Raw SunCalc result: azimuth in radians measured from south towards west,
 *  altitude in radians above the horizon. */
export function sunPositionRaw(date: Date, lat: number, lon: number): { azimuth: number; altitude: number } {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = sunCoords(d);
  const H = RAD * (280.16 + 360.9856235 * d) - lw - c.ra;
  return {
    azimuth: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)),
    altitude: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)),
  };
}

/** Compass bearing (degrees clockwise from north) and altitude (degrees). */
export function sunPosition(date: Date, lat: number, lon: number): { bearingDeg: number; altitudeDeg: number } {
  const r = sunPositionRaw(date, lat, lon);
  return { bearingDeg: ((r.azimuth / RAD + 180) % 360 + 360) % 360, altitudeDeg: r.altitude / RAD };
}

/** Unit vector towards the sun in the local east/north/up frame. */
export function sunDirectionEnu(bearingDeg: number, altitudeDeg: number): { e: number; n: number; up: number } {
  const b = bearingDeg * RAD, a = altitudeDeg * RAD;
  return { e: Math.cos(a) * Math.sin(b), n: Math.cos(a) * Math.cos(b), up: Math.sin(a) };
}

/** German/English 8-wind compass label for a bearing, e.g. 135° → "SO"/"SE". */
export function compassLabel(bearingDeg: number, lang: 'de' | 'en'): string {
  const de = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (lang === 'de' ? de : en)[Math.round(bearingDeg / 45) % 8];
}
