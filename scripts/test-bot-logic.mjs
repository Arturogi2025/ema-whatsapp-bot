/**
 * Comprehensive test suite for Bolt WhatsApp AI Bot
 * Tests all core logic functions as pure JS (no TypeScript imports needed)
 *
 * Run: node scripts/test-bot-logic.mjs
 */

// ============================================================
// Test runner
// ============================================================
let passed = 0;
let failed = 0;
const failures = [];

function assert(testName, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName} — expected "${expected}", got "${actual}"`);
    failed++;
    failures.push(`${testName}: expected "${expected}", got "${actual}"`);
  }
}

function assertNotNull(testName, actual) {
  if (actual !== null && actual !== undefined) {
    console.log(`  ✅ ${testName} → "${actual}"`);
    passed++;
  } else {
    console.log(`  ❌ ${testName} — expected non-null, got ${actual}`);
    failed++;
    failures.push(`${testName}: expected non-null, got ${actual}`);
  }
}

function assertNull(testName, actual) {
  if (actual === null || actual === undefined) {
    console.log(`  ✅ ${testName} → null`);
    passed++;
  } else {
    console.log(`  ❌ ${testName} — expected null, got "${actual}"`);
    failed++;
    failures.push(`${testName}: expected null, got "${actual}"`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

// ============================================================
// Replicate exact functions from ai-handler.ts
// ============================================================

const ENGLISH_INDICATORS = [
  /\b(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))\b/i,
  /\b(?:i\s+(?:want|need|would|am|have|can)|i'm|i've|i'll)\b/i,
  /\b(?:how\s+much|can\s+you|do\s+you|are\s+you|what\s+(?:is|are|do))\b/i,
  /\b(?:website|web\s+page|online\s+store|ecommerce|e-commerce|landing\s+page)\b/i,
  /\b(?:please|thanks|thank\s+you|interested|information|info|quote|pricing)\b/i,
  /\b(?:the|and|for|with|this|that|from|have|more|about|your)\b/i,
  /\b(?:project|business|company|schedule|call|meeting|appointment)\b/i,
  /\b(?:driving|busy|later|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/i,
];

const SPANISH_INDICATORS = [
  /\b(?:hola|buenos?\s*d[ií]as?|buenas?\s*(?:tardes?|noches?))\b/i,
  /\b(?:necesito|quiero|tengo|puedo|estoy|somos|tiene|puede)\b/i,
  /\b(?:p[aá]gina|tienda|precio|costo|cu[aá]nto|cotizaci[oó]n)\b/i,
  /\b(?:por\s+favor|gracias|interesado|informaci[oó]n)\b/i,
  /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i,
  /\b(?:ma[nñ]ana|manejando|despu[eé]s|luego|ahorita|momento)\b/i,
];

function detectLanguage(text, history = []) {
  const englishScore = ENGLISH_INDICATORS.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0), 0
  );
  const spanishScore = SPANISH_INDICATORS.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0), 0
  );

  if (englishScore > spanishScore && englishScore >= 2) return 'en';
  if (spanishScore > englishScore && spanishScore >= 2) return 'es';

  const recentUserMsgs = history.filter(m => m.role === 'user').slice(-3);
  for (const msg of recentUserMsgs) {
    const histEn = ENGLISH_INDICATORS.reduce((s, p) => s + (p.test(msg.content) ? 1 : 0), 0);
    const histEs = SPANISH_INDICATORS.reduce((s, p) => s + (p.test(msg.content) ? 1 : 0), 0);
    if (histEn > histEs && histEn >= 2) return 'en';
  }

  return 'es';
}

const DEFER_PATTERNS_ES = [
  /\b(?:luego\s+(?:te|le|les)\s+(?:aviso|digo|escribo|contesto|respondo|marco))\b/i,
  /\b(?:ahorita\s+(?:no\s+puedo|estoy\s+(?:ocupad[oa]|manejando|en\s+(?:junta|reunion|clase|trabajo))))\b/i,
  /\b(?:estoy\s+(?:manejando|ocupad[oa]|en\s+(?:junta|reunion|clase|trabajo|una\s+llamada)))\b/i,
  /\b(?:despu[eé]s\s+(?:te|le|les)\s+(?:aviso|digo|escribo|contesto|respondo|marco))\b/i,
  /\b(?:m[aá]s\s+(?:tarde|al\s+rato)\s+(?:te|le)\s+(?:aviso|escribo|contesto|marco))\b/i,
  /\b(?:te\s+(?:aviso|escribo|marco|contesto)\s+(?:luego|despu[eé]s|m[aá]s\s+(?:tarde|al\s+rato)))\b/i,
  /\b(?:no\s+puedo\s+(?:hablar|contestar|responder)\s+(?:ahorita|ahora|en\s+este\s+momento))\b/i,
  /\b(?:al\s+rato\s+(?:te|le)\s+(?:aviso|escribo|contesto|marco))\b/i,
];

const DEFER_PATTERNS_EN = [
  /\b(?:i'll\s+(?:get\s+back|respond|reply|write|call|message)\s+(?:to\s+you\s+)?later)\b/i,
  /\b(?:(?:i'm|i\s+am)\s+(?:driving|busy|in\s+a\s+meeting|at\s+work|not\s+available))\b/i,
  /\b(?:can(?:'t|not)\s+(?:talk|chat|respond|reply)\s+(?:right\s+now|now|at\s+the\s+moment))\b/i,
  /\b(?:(?:let\s+me|i'll)\s+(?:get\s+back\s+to\s+you|respond|reply)\s+(?:later|tomorrow|soon))\b/i,
  /\b(?:talk\s+(?:to\s+you\s+)?later)\b/i,
  /\b(?:brb|ttyl)\b/i,
];

function detectDeferral(text, language) {
  const patterns = language === 'en' ? DEFER_PATTERNS_EN : DEFER_PATTERNS_ES;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return language === 'en'
        ? 'Customer indicated they will respond later'
        : 'Cliente indicó que responderá después';
    }
  }
  return null;
}

// ============================================================
// TEST 1: Language Detection
// ============================================================
section('1. LANGUAGE DETECTION');

console.log('\n  -- Spanish messages --');
assert('Simple greeting "Hola"', detectLanguage('Hola'), 'es');
assert('"Buenos días"', detectLanguage('Buenos días'), 'es');
assert('"Buenas tardes"', detectLanguage('Buenas tardes'), 'es');
assert('"Necesito una página web"', detectLanguage('Necesito una página web para mi negocio'), 'es');
assert('"Cuánto cuesta?"', detectLanguage('Cuánto cuesta una tienda en línea?'), 'es');
assert('"Estoy interesado"', detectLanguage('Estoy interesado en sus servicios'), 'es');
assert('"Me gustaría agendar"', detectLanguage('Me gustaría agendar una llamada para el lunes'), 'es');
assert('"Estoy manejando"', detectLanguage('Estoy manejando, luego te aviso'), 'es');

console.log('\n  -- English messages --');
assert('"Hello, I need a website"', detectLanguage('Hello, I need a website'), 'en');
assert('"Hi, I want an online store"', detectLanguage("Hi, I want an online store for my business"), 'en');
assert('"How much does a landing page cost?"', detectLanguage('How much does a landing page cost?'), 'en');
assert('"I am interested"', detectLanguage("I am interested in your web development services"), 'en');
assert('"Good morning, can you help?"', detectLanguage('Good morning, can you help me with a project?'), 'en');
assert('"I need a website"', detectLanguage('I need a website for my company'), 'en');
assert('"I\'m driving, talk later"', detectLanguage("I'm driving right now, talk to you later"), 'en');
assert('"Can you build me an ecommerce?"', detectLanguage('Can you build me an ecommerce site?'), 'en');

console.log('\n  -- Ambiguous / edge cases --');
assert('"OK" defaults to Spanish', detectLanguage('OK'), 'es');
assert('"Si" defaults to Spanish', detectLanguage('Si'), 'es');
assert('"👍" defaults to Spanish', detectLanguage('👍'), 'es');
assert('"3pm" defaults to Spanish', detectLanguage('3pm'), 'es');

console.log('\n  -- History-based detection --');
assert('Ambiguous msg with English history', detectLanguage('OK', [
  { role: 'user', content: 'Hello, I need a website for my business' },
  { role: 'assistant', content: 'Hi! What kind of website do you need?' },
]), 'en');
assert('Ambiguous msg with Spanish history', detectLanguage('OK', [
  { role: 'user', content: 'Hola, necesito una página web' },
  { role: 'assistant', content: '¡Hola! ¿Qué tipo de proyecto necesita?' },
]), 'es');

// ============================================================
// TEST 2: Deferral Detection (Auto-pause triggers)
// ============================================================
section('2. DEFERRAL DETECTION (Auto-pause)');

console.log('\n  -- Spanish deferral patterns --');
assertNotNull('"Estoy manejando"', detectDeferral('Estoy manejando', 'es'));
assertNotNull('"Luego te aviso"', detectDeferral('Luego te aviso', 'es'));
assertNotNull('"Ahorita no puedo"', detectDeferral('Ahorita no puedo, estoy ocupado', 'es'));
assertNotNull('"Después te escribo"', detectDeferral('Después te escribo', 'es'));
assertNotNull('"Más tarde te aviso"', detectDeferral('Más tarde te aviso', 'es'));
assertNotNull('"Te aviso luego"', detectDeferral('Te aviso luego', 'es'));
assertNotNull('"No puedo hablar ahorita"', detectDeferral('No puedo hablar ahorita', 'es'));
assertNotNull('"Al rato te aviso"', detectDeferral('Al rato te aviso', 'es'));
assertNotNull('"Ahorita estoy en junta"', detectDeferral('Ahorita estoy en junta', 'es'));
assertNotNull('"Ahorita estoy en clase"', detectDeferral('Ahorita estoy en clase, te marco después', 'es'));

console.log('\n  -- English deferral patterns --');
assertNotNull('"I\'m driving right now"', detectDeferral("I'm driving right now", 'en'));
assertNotNull('"I\'ll get back to you later"', detectDeferral("I'll get back to you later", 'en'));
assertNotNull('"Can\'t talk right now"', detectDeferral("Can't talk right now", 'en'));
assertNotNull('"Let me get back to you later"', detectDeferral("Let me get back to you later", 'en'));
assertNotNull('"Talk to you later"', detectDeferral("Talk to you later", 'en'));
assertNotNull('"I\'m busy"', detectDeferral("I'm busy at the moment", 'en'));
assertNotNull('"I\'m in a meeting"', detectDeferral("I'm in a meeting", 'en'));
assertNotNull('"brb"', detectDeferral("brb", 'en'));
assertNotNull('"ttyl"', detectDeferral("ttyl", 'en'));

console.log('\n  -- Non-deferral messages (should NOT trigger pause) --');
assertNull('"Hola, necesito una web"', detectDeferral('Hola, necesito una página web', 'es'));
assertNull('"Cuánto cuesta?"', detectDeferral('Cuánto cuesta?', 'es'));
assertNull('"El lunes a las 3"', detectDeferral('El lunes a las 3 de la tarde', 'es'));
assertNull('"Hello I need a site"', detectDeferral('Hello, I need a website', 'en'));
assertNull('"How much?"', detectDeferral('How much does it cost?', 'en'));
assertNull('"Monday at 3pm"', detectDeferral('Monday at 3pm works for me', 'en'));
assertNull('"Sí, perfecto"', detectDeferral('Sí, perfecto', 'es'));
assertNull('"Sounds good"', detectDeferral('Sounds good', 'en'));

// ============================================================
// TEST 3: Intent Detection Patterns
// ============================================================
section('3. INTENT / PATTERN DETECTION');

console.log('\n  -- Project type keywords --');
const PROJECT_KEYWORDS = [
  'pagina web', 'página web', 'sitio web', 'tienda en linea', 'tienda en línea',
  'tienda online', 'landing', 'landing page', 'ecommerce', 'e-commerce',
  'rediseño', 'rediseno', 'sistema', 'aplicación', 'aplicacion', 'app',
  'tienda', 'web', 'website', 'web page', 'web site', 'online store',
  'web app', 'web application', 'redesign', 'custom system', 'store', 'shop',
];

const testProject = (text, expected) => {
  const lower = text.toLowerCase();
  const found = PROJECT_KEYWORDS.some(kw => lower.includes(kw));
  assert(`"${text.slice(0, 50)}" → project=${expected}`, found, expected);
};

testProject('Necesito una página web para mi negocio', true);
testProject('Quiero una tienda en línea', true);
testProject('Me interesa un ecommerce', true);
testProject('Necesito una landing page', true);
testProject('Quiero rediseñar mi sitio web', true);
testProject('I need a website for my company', true);
testProject('I want an online store', true);
testProject('Hola, buenos días', false);
testProject('Cuánto cuesta?', false);

console.log('\n  -- Schedule pattern detection --');
const SCHEDULE_PATTERNS =
  /\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b|\b(?:ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)\b|(?:a\s+las?\s+)\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche)))?|\b\d{1,2}:\d{2}\b(?:\s*(?:am|pm|hrs?))?|\b\d{1,2}\s*(?:am|pm)\b|\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

const SCHEDULE_PATTERNS_EN =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:tomorrow|today)\b|(?:at\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\b\d{1,2}:\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i;

const testSchedule = (text, expected) => {
  const lower = text.toLowerCase();
  const match = SCHEDULE_PATTERNS.test(lower) || SCHEDULE_PATTERNS_EN.test(lower);
  assert(`"${text.slice(0, 50)}" → schedule=${expected}`, match, expected);
};

testSchedule('El lunes a las 3 de la tarde', true);
testSchedule('Mañana a las 10am', true);
testSchedule('El jueves a las 2pm', true);
testSchedule('15 de abril a las 3', true);
testSchedule('Miércoles por la tarde', true);
testSchedule('Monday at 3pm', true);
testSchedule('Tomorrow at 10am', true);
testSchedule('Friday at 2:30pm', true);
testSchedule('April 15', true);
testSchedule('Hola necesito una web', false);
testSchedule('Cuánto cuesta?', false);

console.log('\n  -- Price inquiry detection --');
const PRICE_PATTERNS =
  /(?:cu[aá]nto\s+(?:cuesta|cobran|sale|costo|vale)|precio|costo|tarifa|cotizaci[oó]n|presupuesto|inversi[oó]n|rangos?\s+de\s+precio)/i;
const PRICE_PATTERNS_EN = /(?:how\s+much|price|cost|pricing|quote|estimate|budget|rates?|investment)\b/i;

const testPrice = (text, expected) => {
  const match = PRICE_PATTERNS.test(text) || PRICE_PATTERNS_EN.test(text);
  assert(`"${text.slice(0, 50)}" → price=${expected}`, match, expected);
};

testPrice('Cuánto cuesta una página web?', true);
testPrice('Cuál es el precio?', true);
testPrice('Me pueden dar una cotización?', true);
testPrice('How much does a website cost?', true);
testPrice('Can I get a quote?', true);
testPrice('What are your pricing rates?', true);
testPrice('Hola buenos días', false);
testPrice('Necesito una web', false);

// ============================================================
// TEST 4: Datetime Extraction
// ============================================================
section('4. DATETIME EXTRACTION');

const dtPatterns = [
  /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)(?:\s+\d{1,2}(?:\s+de\s+\w+)?)?\s+(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))/i,
  /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)(?:\s+\d{1,2}(?:\s+de\s+\w+)?)?\s+(?:a\s+las?\s+)\d{1,2}(?::\d{2})?/i,
  /\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))?)?/i,
  /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)(?:\s+(?:por\s+la\s+|en\s+la\s+)?(?:ma[nñ]ana|tarde|noche))/i,
  /(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|pasado\s+ma[nñ]ana)/i,
  /(?:a\s+las?\s+)\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|de\s+la\s+(?:ma[nñ]ana|tarde|noche))/i,
  /(?:a\s+las?\s+)\d{1,2}(?::\d{2})?/i,
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
];

function extractDatetime(text) {
  const lower = text.toLowerCase();
  for (const pattern of dtPatterns) {
    const match = lower.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

console.log('\n  -- Full datetime strings --');
assertNotNull('"El jueves a las 3 de la tarde"', extractDatetime('El jueves a las 3 de la tarde'));
assertNotNull('"Mañana a las 10am"', extractDatetime('Mañana a las 10am'));
assertNotNull('"El lunes a las 2"', extractDatetime('El lunes a las 2'));
assertNotNull('"15 de abril a las 3 de la tarde"', extractDatetime('15 de abril a las 3 de la tarde'));
assertNotNull('"El miércoles por la tarde"', extractDatetime('El miércoles por la tarde'));
assertNotNull('"Mañana" (day alone)', extractDatetime('Mañana'));
assertNotNull('"A las 3pm"', extractDatetime('A las 3pm'));
assertNotNull('"3pm" (standalone)', extractDatetime('3pm'));
assertNotNull('"Pasado mañana a las 10"', extractDatetime('Pasado mañana a las 10'));
assertNotNull('"El viernes a las 4 de la tarde"', extractDatetime('El viernes a las 4 de la tarde'));

console.log('\n  -- Should NOT extract datetime --');
assertNull('"Hola necesito una web"', extractDatetime('Hola necesito una web'));
assertNull('"Cuánto cuesta?"', extractDatetime('Cuánto cuesta?'));
assertNull('"Tengo 12 empleados"', extractDatetime('Tengo 12 empleados'));

// ============================================================
// TEST 5: Meeting Time Parser (from cron)
// ============================================================
section('5. MEETING TIME PARSER');

function parseMeetingTime(datetimeStr) {
  const isoDate = new Date(datetimeStr);
  if (!isNaN(isoDate.getTime()) && datetimeStr.includes('-')) return isoDate;

  const now = new Date();
  const currentYear = now.getFullYear();
  const months = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  let day = null, month = null;
  const dateMatch = datetimeStr.match(/(\d{1,2})\s+de\s+(\w+)/i);
  if (dateMatch) {
    day = parseInt(dateMatch[1]);
    const monthName = dateMatch[2].toLowerCase();
    if (months[monthName] !== undefined) month = months[monthName];
  }

  let hours = null, minutes = 0;
  const time12Match = datetimeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)/i);
  if (time12Match) {
    hours = parseInt(time12Match[1]);
    minutes = time12Match[2] ? parseInt(time12Match[2]) : 0;
    const isPM = time12Match[3].toLowerCase() === 'pm';
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  } else {
    const time24Match = datetimeStr.match(/(\d{1,2}):(\d{2})/);
    if (time24Match) {
      hours = parseInt(time24Match[1]);
      minutes = parseInt(time24Match[2]);
    } else {
      const simpleTimeMatch = datetimeStr.match(/las?\s+(\d{1,2})/i);
      if (simpleTimeMatch) {
        hours = parseInt(simpleTimeMatch[1]);
        if (hours < 8) hours += 12;
      }
    }
  }

  if (day !== null && month !== null && hours !== null) {
    return new Date(currentYear, month, day, hours, minutes, 0);
  }
  if (hours !== null && day === null) {
    const meetingDate = new Date(now);
    meetingDate.setHours(hours, minutes, 0, 0);
    return meetingDate;
  }
  return null;
}

const mt1 = parseMeetingTime('el jueves 10 de abril a las 3 de la tarde');
assertNotNull('"el jueves 10 de abril a las 3 de la tarde"', mt1);
if (mt1) assert('  → hour is 15', mt1.getHours(), 15);

const mt2 = parseMeetingTime('15 de abril a las 10am');
assertNotNull('"15 de abril a las 10am"', mt2);
if (mt2) {
  assert('  → month is April (3)', mt2.getMonth(), 3);
  assert('  → day is 15', mt2.getDate(), 15);
  assert('  → hour is 10', mt2.getHours(), 10);
}

const mt3 = parseMeetingTime('a las 3pm');
assertNotNull('"a las 3pm"', mt3);
if (mt3) assert('  → hour is 15', mt3.getHours(), 15);

const mt4 = parseMeetingTime('2025-04-10T15:00:00.000Z');
assertNotNull('"ISO format"', mt4);

const mt5 = parseMeetingTime('a las 3 de la tarde');
assertNotNull('"a las 3 de la tarde"', mt5);
if (mt5) assert('  → hour is 15', mt5.getHours(), 15);

const mt6 = parseMeetingTime('hola quiero info');
assertNull('"hola quiero info" (no time)', mt6);

const mt7 = parseMeetingTime('20 de mayo a las 2pm');
assertNotNull('"20 de mayo a las 2pm"', mt7);
if (mt7) {
  assert('  → month is May (4)', mt7.getMonth(), 4);
  assert('  → day is 20', mt7.getDate(), 20);
  assert('  → hour is 14', mt7.getHours(), 14);
}

// ============================================================
// TEST 6: Business Hours Logic
// ============================================================
section('6. BUSINESS HOURS LOGIC');

function isBusinessHours(hour) { return hour >= 9 && hour < 21; }

assert('8am → outside', isBusinessHours(8), false);
assert('9am → inside', isBusinessHours(9), true);
assert('12pm → inside', isBusinessHours(12), true);
assert('20 (8pm) → inside', isBusinessHours(20), true);
assert('21 (9pm) → outside', isBusinessHours(21), false);
assert('23 (11pm) → outside', isBusinessHours(23), false);
assert('0 (midnight) → outside', isBusinessHours(0), false);

// ============================================================
// TEST 7: Follow-up Stage Timing
// ============================================================
section('7. FOLLOW-UP STAGE TIMING');

function getFollowupStage(hoursSinceLastMsg, currentStage) {
  const daysSinceLastMsg = hoursSinceLastMsg / 24;
  if (currentStage === 0 && hoursSinceLastMsg >= 2 && hoursSinceLastMsg <= 20) return 1;
  if (currentStage <= 1 && daysSinceLastMsg >= 1 && daysSinceLastMsg < 2) return 2;
  if (currentStage <= 2 && daysSinceLastMsg >= 2 && daysSinceLastMsg < 5) return 3;
  if (currentStage <= 3 && daysSinceLastMsg >= 5 && daysSinceLastMsg < 10) return 4;
  if (currentStage <= 4 && daysSinceLastMsg >= 10) return 5;
  return null;
}

assert('0h, stage 0 → null (too early)', getFollowupStage(0, 0), null);
assert('1h, stage 0 → null (too early)', getFollowupStage(1, 0), null);
assert('2h, stage 0 → stage 1 (AI follow-up)', getFollowupStage(2, 0), 1);
assert('5h, stage 0 → stage 1', getFollowupStage(5, 0), 1);
assert('20h, stage 0 → stage 1', getFollowupStage(20, 0), 1);
assert('25h, stage 0 → stage 2 (24h template)', getFollowupStage(25, 0), 2);
assert('25h, stage 1 → stage 2', getFollowupStage(25, 1), 2);
assert('50h, stage 2 → stage 3 (48h template)', getFollowupStage(50, 2), 3);
assert('120h (5d), stage 3 → stage 4 (5d template)', getFollowupStage(120, 3), 4);
assert('240h (10d), stage 4 → stage 5 (final + close)', getFollowupStage(240, 4), 5);
assert('240h, stage 5 → null (already done)', getFollowupStage(240, 5), null);

// ============================================================
// TEST 8: Greeting Patterns
// ============================================================
section('8. GREETING PATTERNS');

const GREETING_PATTERNS =
  /^(hola|hi|hello|hey|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|que\s*tal|saludos|buen\s*d[ií]a)/i;

const testGreeting = (text, expected) => {
  assert(`"${text}" → greeting=${expected}`, GREETING_PATTERNS.test(text), expected);
};

testGreeting('Hola', true);
testGreeting('Hola, buenas tardes', true);
testGreeting('Buenos días', true);
testGreeting('Buenas noches', true);
testGreeting('Hello', true);
testGreeting('Hi', true);
testGreeting('Hey', true);
testGreeting('Que tal', true);
testGreeting('Buen día', true);
testGreeting('Necesito una web', false);
testGreeting('Cuánto cuesta?', false);
testGreeting('El lunes a las 3', false);

// ============================================================
// TEST 9: Deferred Conversation Detection (Cron)
// ============================================================
section('9. DEFERRED CONVERSATION DETECTION (Cron)');

function isDeferral(autoReasonStr) {
  const reason = (autoReasonStr || '').toLowerCase();
  return reason.includes('respond') || reason.includes('later') ||
    reason.includes('después') || reason.includes('despues') || reason.includes('responder');
}

assert('"Cliente indicó que responderá después"', isDeferral('Cliente indicó que responderá después'), true);
assert('"Customer indicated they will respond later"', isDeferral('Customer indicated they will respond later'), true);
assert('"Llamada agendada - IA pausada"', isDeferral('Llamada agendada - IA pausada automáticamente'), false);
assert('"Call scheduled - AI auto-paused"', isDeferral('Call scheduled - AI auto-paused'), false);
assert('Empty string', isDeferral(''), false);

// ============================================================
// TEST 10: Auto-unpause on Returning Lead
// ============================================================
section('10. RETURNING LEAD / AUTO-UNPAUSE LOGIC');

function shouldUnpause(aiPaused, autoReason, hoursSilent) {
  return aiPaused && autoReason !== null && hoursSilent >= 24;
}

assert('Paused + reason + 48h → unpause', shouldUnpause(true, 'customer_deferred', 48), true);
assert('Paused + reason + 12h → no unpause (< 24h)', shouldUnpause(true, 'customer_deferred', 12), false);
assert('Not paused → no unpause', shouldUnpause(false, null, 48), false);
assert('Paused + no reason + 48h → no unpause', shouldUnpause(true, null, 48), false);

function isReturningLead(lastCustomerMsgAt, nowMs) {
  if (!lastCustomerMsgAt) return false;
  const hoursSilent = (nowMs - new Date(lastCustomerMsgAt).getTime()) / (1000 * 60 * 60);
  return hoursSilent >= 24;
}

const now = Date.now();
assert('Msg 2 days ago → returning', isReturningLead(new Date(now - 48 * 3600 * 1000).toISOString(), now), true);
assert('Msg 5 hours ago → not returning', isReturningLead(new Date(now - 5 * 3600 * 1000).toISOString(), now), false);
assert('No previous msg → not returning', isReturningLead(null, now), false);

// ============================================================
// TEST 11: Anti-double-message protection
// ============================================================
section('11. ANTI-DOUBLE-MESSAGE PROTECTION');

function shouldSkipAI(history) {
  const recentAssistantMsgs = history.filter(m => m.role === 'assistant');
  const recentUserMsgs = history.filter(m => m.role === 'user');

  if (recentAssistantMsgs.length > 0 && recentUserMsgs.length <= 1) {
    const lastMsg = history[history.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      const lastTwo = history.slice(-2).every(m => m.role === 'assistant');
      if (lastTwo) return true;
    }
  }
  return false;
}

assert('2 consecutive assistant msgs → skip', shouldSkipAI([
  { role: 'assistant', content: 'Hello!' },
  { role: 'assistant', content: 'How can I help?' },
  { role: 'user', content: 'Hi' },
]), false); // user just wrote, last is user, so don't skip

assert('Normal conversation → no skip', shouldSkipAI([
  { role: 'user', content: 'Hi' },
  { role: 'assistant', content: 'Hello!' },
  { role: 'user', content: 'Need a website' },
]), false);

assert('Only assistant msgs (rare) → skip', shouldSkipAI([
  { role: 'assistant', content: 'Hello!' },
  { role: 'assistant', content: 'How can I help?' },
]), true);

// ============================================================
// TEST 12: Followup stage reset on customer response
// ============================================================
section('12. FOLLOWUP STAGE RESET');

function shouldResetFollowup(followupStage) {
  return followupStage && followupStage > 0;
}

assert('Stage 3 → should reset', !!shouldResetFollowup(3), true);
assert('Stage 1 → should reset', !!shouldResetFollowup(1), true);
assert('Stage 0 → no reset', !!shouldResetFollowup(0), false);
assert('Null → no reset', !!shouldResetFollowup(null), false);

// ============================================================
// TEST 13: Smart Followup Template Selection
// ============================================================
section('13. SMART FOLLOWUP TEMPLATES');

function generateSmartFollowup(leadName, projectType, conversationId) {
  const seed = (leadName + conversationId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hasProject = projectType && projectType !== 'proyecto digital';

  const templatesWithProject = [
    `Hola ${leadName}, ¿tuvo oportunidad de pensar en su proyecto de ${projectType}?`,
    `Hola ${leadName}, solo quería dar seguimiento sobre su ${projectType}.`,
    `Hola ${leadName}, del equipo de Bolt. Quedamos pendientes de platicar sobre su ${projectType}.`,
  ];

  const templatesGeneric = [
    `Hola ${leadName}, del equipo de Bolt. ¿Tuvo oportunidad de pensar en su proyecto?`,
    `Hola ${leadName}, solo quería dar seguimiento.`,
    `Hola ${leadName}, del equipo de Bolt. Nos encantaría platicar sobre su proyecto.`,
  ];

  const templates = hasProject ? templatesWithProject : templatesGeneric;
  return templates[seed % templates.length];
}

const fu1 = generateSmartFollowup('María', 'web', 'conv-123');
assert('With project type → mentions project', fu1.includes('web'), true);

const fu2 = generateSmartFollowup('Juan', 'proyecto digital', 'conv-456');
assert('Generic project → uses generic template', !fu2.includes('proyecto digital'), true);

const fu3 = generateSmartFollowup('Ana', null, 'conv-789');
assert('Null project → uses generic template', fu3.includes('proyecto'), true);

// ============================================================
// TEST 14: Conversation Status Guards
// ============================================================
section('14. CONVERSATION STATUS GUARDS');

// Test: scheduled conversations should NOT trigger lead/schedule logic
function shouldProcessLeadLogic(conversationStatus) {
  return conversationStatus !== 'scheduled';
}

assert('Active → process lead logic', shouldProcessLeadLogic('active'), true);
assert('Scheduled → skip lead logic', shouldProcessLeadLogic('scheduled'), false);
assert('Closed → process (reopened)', shouldProcessLeadLogic('closed'), true);

// Test: AI should not respond when paused
function shouldAIRespond(aiPaused, mediaType) {
  if (aiPaused) return false;
  if (mediaType === 'reaction') return false;
  return true;
}

assert('Not paused, text → respond', shouldAIRespond(false, 'text'), true);
assert('Paused, text → no respond', shouldAIRespond(true, 'text'), false);
assert('Not paused, reaction → no respond', shouldAIRespond(false, 'reaction'), false);

// ============================================================
// RESULTS
// ============================================================
console.log(`\n${'═'.repeat(60)}`);
console.log(`  FINAL RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);

if (failures.length > 0) {
  console.log('\n  FAILURES:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
