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

/**
 * Format a call datetime as a human-friendly relative label in Spanish.
 *
 * Rules (relative to today in Mexico City time):
 *   same day  → "Hoy · 9:00h"
 *   tomorrow  → "Mañana · 9:00h"
 *   yesterday → "Ayer · 9:00h"
 *   2-6 days  → "Miércoles · 9:00h"
 *   otherwise → "8 de abr · 9:00h"
 */
export function fmtRelativeMX(dt: string | null | undefined): string {
  if (!dt) return 'Sin agendar';

  const date = parseMXDatetime(dt);
  const timeLabel = formatInTimeZone(date, TZ, "H:mm'h'");

  // "Today" date string in Mexico City (YYYY-MM-DD)
  const nowDateStr = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  const targetDateStr = formatInTimeZone(date, TZ, 'yyyy-MM-dd');

  // Day difference (whole days)
  const diffDays = Math.round(
    (new Date(targetDateStr).getTime() - new Date(nowDateStr).getTime()) /
    (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0)  return `Hoy · ${timeLabel}`;
  if (diffDays === 1)  return `Mañana · ${timeLabel}`;
  if (diffDays === -1) return `Ayer · ${timeLabel}`;

  if (Math.abs(diffDays) <= 6) {
    const dayName = formatInTimeZone(date, TZ, 'EEEE', { locale: es });
    return `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)} · ${timeLabel}`;
  }

  return formatInTimeZone(date, TZ, "d 'de' MMM · H:mm'h'", { locale: es });
}
