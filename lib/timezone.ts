/**
 * Timezone detection from phone country codes.
 * Maps phone prefixes to IANA timezone and friendly labels.
 * Used to give the AI context about the client's likely timezone
 * so it can mention "hora de Ciudad de México" when confirming
 * appointments with clients in different time zones.
 */

interface TimezoneInfo {
  /** IANA timezone identifier */
  timezone: string;
  /** Friendly label in Spanish for the AI prompt */
  label: string;
  /** Country name */
  country: string;
  /** Whether this timezone differs from Mexico City */
  differsFromMexico: boolean;
}

/**
 * Common country calling codes → timezone mapping.
 * For countries with multiple timezones (like US, Canada, Brazil),
 * we use the most common/populous timezone as default.
 */
const COUNTRY_CODE_TIMEZONES: Record<string, TimezoneInfo> = {
  // Mexico (home base — no timezone warning needed)
  '52': { timezone: 'America/Mexico_City', label: 'Ciudad de México (CST)', country: 'México', differsFromMexico: false },

  // United States (default to Eastern — most populous)
  '1': { timezone: 'America/New_York', label: 'hora del Este de EE.UU. (EST)', country: 'Estados Unidos', differsFromMexico: true },

  // Central America
  '502': { timezone: 'America/Guatemala', label: 'hora de Guatemala (CST)', country: 'Guatemala', differsFromMexico: false },
  '503': { timezone: 'America/El_Salvador', label: 'hora de El Salvador (CST)', country: 'El Salvador', differsFromMexico: false },
  '504': { timezone: 'America/Tegucigalpa', label: 'hora de Honduras (CST)', country: 'Honduras', differsFromMexico: false },
  '505': { timezone: 'America/Managua', label: 'hora de Nicaragua (CST)', country: 'Nicaragua', differsFromMexico: false },
  '506': { timezone: 'America/Costa_Rica', label: 'hora de Costa Rica (CST)', country: 'Costa Rica', differsFromMexico: false },
  '507': { timezone: 'America/Panama', label: 'hora de Panamá (EST)', country: 'Panamá', differsFromMexico: true },

  // South America
  '54': { timezone: 'America/Argentina/Buenos_Aires', label: 'hora de Argentina (ART)', country: 'Argentina', differsFromMexico: true },
  '55': { timezone: 'America/Sao_Paulo', label: 'hora de Brasil (BRT)', country: 'Brasil', differsFromMexico: true },
  '56': { timezone: 'America/Santiago', label: 'hora de Chile (CLT)', country: 'Chile', differsFromMexico: true },
  '57': { timezone: 'America/Bogota', label: 'hora de Colombia (COT)', country: 'Colombia', differsFromMexico: true },
  '58': { timezone: 'America/Caracas', label: 'hora de Venezuela (VET)', country: 'Venezuela', differsFromMexico: true },
  '51': { timezone: 'America/Lima', label: 'hora de Perú (PET)', country: 'Perú', differsFromMexico: true },
  '593': { timezone: 'America/Guayaquil', label: 'hora de Ecuador (ECT)', country: 'Ecuador', differsFromMexico: true },
  '598': { timezone: 'America/Montevideo', label: 'hora de Uruguay (UYT)', country: 'Uruguay', differsFromMexico: true },

  // Caribbean
  '1809': { timezone: 'America/Santo_Domingo', label: 'hora de Rep. Dominicana (AST)', country: 'República Dominicana', differsFromMexico: true },
  '1829': { timezone: 'America/Santo_Domingo', label: 'hora de Rep. Dominicana (AST)', country: 'República Dominicana', differsFromMexico: true },
  '1849': { timezone: 'America/Santo_Domingo', label: 'hora de Rep. Dominicana (AST)', country: 'República Dominicana', differsFromMexico: true },
  '53': { timezone: 'America/Havana', label: 'hora de Cuba (CST)', country: 'Cuba', differsFromMexico: false },

  // Europe
  '34': { timezone: 'Europe/Madrid', label: 'hora de España (CET)', country: 'España', differsFromMexico: true },
  '44': { timezone: 'Europe/London', label: 'hora de Reino Unido (GMT)', country: 'Reino Unido', differsFromMexico: true },
  '49': { timezone: 'Europe/Berlin', label: 'hora de Alemania (CET)', country: 'Alemania', differsFromMexico: true },
  '33': { timezone: 'Europe/Paris', label: 'hora de Francia (CET)', country: 'Francia', differsFromMexico: true },
  '39': { timezone: 'Europe/Rome', label: 'hora de Italia (CET)', country: 'Italia', differsFromMexico: true },
};

/**
 * Detect timezone info from a phone number.
 * Phone numbers can be in formats like: +521234567890, 521234567890, 1234567890
 */
export function detectTimezoneFromPhone(phone: string): TimezoneInfo | null {
  // Normalize: remove +, spaces, dashes
  const clean = phone.replace(/[\s\-\+\(\)]/g, '');

  // Try longer prefixes first (e.g., 1809 before 1)
  const prefixes = Object.keys(COUNTRY_CODE_TIMEZONES)
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (clean.startsWith(prefix)) {
      return COUNTRY_CODE_TIMEZONES[prefix];
    }
  }

  // Default to Mexico if unrecognized
  return null;
}

/**
 * Build a timezone context string for the AI prompt.
 * Returns empty string if client is in same timezone as Mexico City.
 * Returns a warning string if they're in a different timezone.
 */
export function buildTimezoneContext(phone: string): string {
  const tzInfo = detectTimezoneFromPhone(phone);

  if (!tzInfo || !tzInfo.differsFromMexico) {
    return ''; // Same timezone or unknown — no extra context needed
  }

  // Calculate the current time in the client's timezone
  const now = new Date();
  const clientTime = now.toLocaleString('es-MX', {
    timeZone: tzInfo.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const mexicoTime = now.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `

CONTEXTO DE ZONA HORARIA DEL CLIENTE: Este cliente parece estar en ${tzInfo.country} (${tzInfo.label}). Su hora actual es aproximadamente ${clientTime}, mientras que en Ciudad de México son ${mexicoTime}. IMPORTANTE: Cuando confirmes horarios de cita, SIEMPRE especifica "hora de Ciudad de México (CDMX)" para evitar confusión. Ejemplo: "Queda confirmada su llamada para el jueves 10 de abril a las 3:00 PM hora de Ciudad de México (CDMX)."`;
}

/**
 * Returns true if the phone number is from a country with a different timezone than Mexico City.
 * Used to decide whether timezone clarification is needed before confirming a schedule.
 */
export function needsTimezonesClarification(phone: string): boolean {
  const tzInfo = detectTimezoneFromPhone(phone);
  return tzInfo !== null && tzInfo.differsFromMexico;
}

/**
 * Build a strong nudge for the AI when a scheduling confirmation is detected
 * and the client is in a different timezone.
 * Instructs the AI to ask for timezone clarification BEFORE confirming.
 */
export function buildTimezoneSchedulingNudge(phone: string, language: 'en' | 'es' = 'es'): string {
  const tzInfo = detectTimezoneFromPhone(phone);

  if (!tzInfo || !tzInfo.differsFromMexico) {
    return '';
  }

  if (language === 'en') {
    return `

[TIMEZONE CLARIFICATION REQUIRED] This client appears to be in ${tzInfo.country} (${tzInfo.label}). Their current time differs from Mexico City time. If the client has proposed a specific time for the call, you MUST ask for clarification BEFORE confirming: "Just to make sure we're aligned — is that time in your local time (${tzInfo.country}) or Mexico City time (CDMX)?" Once clarified, always confirm the appointment in Mexico City time (CDMX) explicitly. Example: "Perfect! Your call is confirmed for Thursday, April 10th at 10:00 AM Mexico City time (CDMX)."`;
  }

  return `

[ACLARACIÓN DE ZONA HORARIA REQUERIDA] Este cliente parece estar en ${tzInfo.country} (${tzInfo.label}). Su hora actual difiere de la hora de Ciudad de México. Si el cliente ha propuesto una hora específica para la llamada, DEBES preguntar para aclarar ANTES de confirmar: "Para asegurarnos de que estamos alineados, ¿ese horario es en su hora local (hora de ${tzInfo.country}) o en hora de Ciudad de México (CDMX)?" Una vez aclarado, confirma SIEMPRE en hora de Ciudad de México (CDMX) de forma explícita. Ejemplo: "Perfecto, queda confirmada su llamada para el jueves 10 de abril a las 10:00 AM hora de Ciudad de México (CDMX)."`;
}

/**
 * Convert a datetime string (assumed to be in the client's local timezone)
 * to an ISO 8601 string in Mexico City timezone.
 *
 * @param isoDatetime  - ISO string with or without timezone offset (e.g., "2026-04-10T15:00:00")
 * @param clientTimezone - IANA timezone of the client (e.g., "Europe/Madrid")
 * @returns ISO string adjusted to Mexico City timezone
 */
export function convertClientTimeToMexico(isoDatetime: string, clientTimezone: string): string {
  // Strip existing offset/Z so we treat the wall-clock digits as client-local
  const stripped = isoDatetime.replace(/([+-]\d{2}:\d{2}|Z)$/, '');

  // Parse the component parts
  const [datePart, timePart = '00:00:00'] = stripped.split('T');
  const [yr, mo, dy] = datePart.split('-').map(Number);
  const timeParts = timePart.split(':');
  const hr = Number(timeParts[0] || 0);
  const mn = Number(timeParts[1] || 0);
  const sc = Number(timeParts[2] || 0);

  // Create a "proxy" UTC timestamp using the same wall-clock digits treated as UTC.
  // We'll then correct for the actual timezone offset below.
  const proxyUtc = new Date(Date.UTC(yr, mo - 1, dy, hr, mn, sc));

  // Find what this proxy-UTC moment looks like in the client timezone
  const clientFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: clientTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const clientParts = Object.fromEntries(
    clientFmt.formatToParts(proxyUtc).map(p => [p.type, p.value])
  );

  // Offset = how many minutes the client timezone adds to UTC
  // E.g. Madrid (UTC+1): proxyUTC 15:00 shows as 16:00 → offset = +60 min
  // E.g. US Eastern (UTC-5): proxyUTC 15:00 shows as 10:00 → offset = -300 min
  const displayH = parseInt(clientParts.hour, 10);
  const displayM = parseInt(clientParts.minute, 10);
  const displayS = parseInt(clientParts.second, 10);

  let offsetMin =
    (displayH * 60 + displayM + displayS / 60) - (hr * 60 + mn + sc / 60);

  // Handle day boundary (e.g., UTC+11 wraps 23:00 → next day 10:00)
  if (offsetMin > 14 * 60) offsetMin -= 24 * 60;
  if (offsetMin < -12 * 60) offsetMin += 24 * 60;

  // True UTC = proxyUtc − offset
  const trueUtc = new Date(proxyUtc.getTime() - offsetMin * 60 * 1000);

  // Format true UTC in Mexico City
  const mxFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const mxParts = Object.fromEntries(
    mxFmt.formatToParts(trueUtc).map(p => [p.type, p.value])
  );

  // Calculate Mexico City UTC offset for the ISO string suffix
  const utcFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const utcTotalMin =
    parseInt(utcFmt.formatToParts(trueUtc).find(p => p.type === 'hour')!.value, 10) * 60 +
    parseInt(utcFmt.formatToParts(trueUtc).find(p => p.type === 'minute')!.value, 10);
  const mxTotalMin =
    parseInt(mxParts.hour, 10) * 60 + parseInt(mxParts.minute, 10);

  let mxOffsetMin = mxTotalMin - utcTotalMin;
  if (mxOffsetMin > 14 * 60) mxOffsetMin -= 24 * 60;
  if (mxOffsetMin < -12 * 60) mxOffsetMin += 24 * 60;

  const mxSign = mxOffsetMin >= 0 ? '+' : '-';
  const mxAbsH = Math.floor(Math.abs(mxOffsetMin) / 60);
  const mxAbsM = Math.abs(mxOffsetMin) % 60;
  const tzStr = `${mxSign}${String(mxAbsH).padStart(2, '0')}:${String(mxAbsM).padStart(2, '0')}`;

  return `${mxParts.year}-${mxParts.month}-${mxParts.day}T${mxParts.hour}:${mxParts.minute}:${mxParts.second}${tzStr}`;
}
