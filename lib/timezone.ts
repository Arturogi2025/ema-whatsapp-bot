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
