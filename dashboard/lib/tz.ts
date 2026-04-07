// Timezone utilities — all times displayed in America/Mexico_City

import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';

const TZ = 'America/Mexico_City';

/**
 * Format a date string or Date object in Mexico City timezone.
 * Uses date-fns format tokens.
 */
export function fmtMX(date: string | Date, fmt: string): string {
  return formatInTimeZone(new Date(date), TZ, fmt, { locale: es });
}

/**
 * Parse a preferred_datetime string into a Date object.
 * Strings with a timezone offset are used as-is.
 * Bare strings (e.g. "2026-04-08T09:00") are treated as Mexico City time (UTC-6).
 */
export function parseMXDatetime(dt: string): Date {
  const hasTz = /([+-]\d{2}:?\d{2}|Z)$/.test(dt);
  return hasTz ? new Date(dt) : new Date(dt + '-06:00');
}
