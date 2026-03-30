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
