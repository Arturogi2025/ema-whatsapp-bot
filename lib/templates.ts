/**
 * WhatsApp Message Templates for Bolt
 *
 * These templates are used when the 24-hour messaging window has expired.
 * Each template must be pre-approved by Meta in WhatsApp Business Manager.
 *
 * Template naming convention: lowercase_with_underscores
 * All templates use "usted" (formal Spanish)
 * Language: es_MX (Spanish - Mexico)
 */

export type TemplateCategory = 'utility' | 'marketing';

export interface TemplateVariable {
  key: string;
  description: string;
  example: string;
}

export interface WhatsAppTemplate {
  name: string;
  displayName: string;
  category: TemplateCategory;
  description: string;
  body: string;
  variables: TemplateVariable[];
  /** Which conversation/lead statuses this template is relevant for */
  relevantStatuses?: string[];
  /** Auto-send trigger (if applicable) */
  autoTrigger?: 'reminder_2h' | 'reminder_24h' | null;
}

// ============================================================
// UTILITY Templates (Transactional — higher approval rate)
// ============================================================

const recordatorio_reunion_2h: WhatsAppTemplate = {
  name: 'recordatorio_reunion_2h',
  displayName: 'Recordatorio de reunión (2 horas)',
  category: 'utility',
  description: 'Se envía automáticamente 2 horas antes de la reunión agendada',
  body: 'Hola {{1}}, le recordamos que su reunión con el equipo de Bolt está programada para hoy a las {{2}}. ¿Nos confirma su asistencia? Estamos listos para atenderle. 🟡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Hora de la reunión', example: '3:00 PM' },
  ],
  relevantStatuses: ['scheduled'],
  autoTrigger: 'reminder_2h',
};

const recordatorio_reunion_24h: WhatsAppTemplate = {
  name: 'recordatorio_reunion_24h',
  displayName: 'Recordatorio de reunión (24 horas)',
  category: 'utility',
  description: 'Se envía automáticamente 24 horas antes de la reunión agendada',
  body: 'Hola {{1}}, le recordamos que mañana tiene una reunión agendada con Bolt a las {{2}}. Si necesita reagendar, responda a este mensaje y con gusto le buscamos otro horario. ⚡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Hora de la reunión', example: '3:00 PM' },
  ],
  relevantStatuses: ['scheduled'],
  autoTrigger: 'reminder_24h',
};

const confirmacion_reunion_agendada: WhatsAppTemplate = {
  name: 'confirmacion_reunion_agendada',
  displayName: 'Confirmación de reunión agendada',
  category: 'utility',
  description: 'Se envía cuando se confirma una reunión desde el dashboard',
  body: 'Hola {{1}}, su reunión con Bolt ha sido confirmada para el {{2}} a las {{3}}. Le contactará {{4}}, su asesor personalizado. Si tiene alguna duda antes de la reunión, puede escribirnos aquí. ✅',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Fecha de la reunión', example: 'jueves 10 de abril' },
    { key: '3', description: 'Hora de la reunión', example: '3:00 PM' },
    { key: '4', description: 'Nombre del asesor', example: 'Diego' },
  ],
  relevantStatuses: ['scheduled'],
  autoTrigger: null,
};

const asignacion_asesor: WhatsAppTemplate = {
  name: 'asignacion_asesor',
  displayName: 'Asignación de asesor',
  category: 'utility',
  description: 'Notifica al cliente que un asesor le dará seguimiento',
  body: 'Hola {{1}}, le informamos que {{2}} de nuestro equipo le dará seguimiento personalizado a su proyecto de {{3}}. En breve se pondrá en contacto con usted por este mismo medio. ⚡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Nombre del asesor', example: 'Diego' },
    { key: '3', description: 'Tipo de proyecto', example: 'página web' },
  ],
  relevantStatuses: ['new', 'contacted', 'scheduled'],
  autoTrigger: null,
};

// ============================================================
// MARKETING Templates (Promotional — needs more careful approval)
// ============================================================

const seguimiento_sin_respuesta_48h: WhatsAppTemplate = {
  name: 'seguimiento_sin_respuesta_48h',
  displayName: 'Seguimiento (sin respuesta 48h)',
  category: 'marketing',
  description: 'Se envía cuando el lead no responde en 48 horas',
  body: 'Hola {{1}}, soy del equipo de Bolt. Le escribimos hace un par de días sobre su proyecto. ¿Sigue interesado en recibir una cotización sin compromiso? Estamos para servirle. ⚡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
  ],
  relevantStatuses: ['active', 'new', 'contacted'],
  autoTrigger: null,
};

const seguimiento_sin_agendar: WhatsAppTemplate = {
  name: 'seguimiento_sin_agendar',
  displayName: 'Seguimiento (sin agendar llamada)',
  category: 'marketing',
  description: 'Para leads que mostraron interés pero no agendaron',
  body: 'Hola {{1}}, en Bolt notamos que mostró interés en su proyecto de {{2}}. ¿Le gustaría agendar una breve llamada de 15 minutos para platicar los detalles? Puede elegir el horario que más le convenga. 📅',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Tipo de proyecto', example: 'tienda en línea' },
  ],
  relevantStatuses: ['active', 'contacted'],
  autoTrigger: null,
};

const solicitud_detalles_proyecto: WhatsAppTemplate = {
  name: 'solicitud_detalles_proyecto',
  displayName: 'Solicitud de detalles del proyecto',
  category: 'marketing',
  description: 'Solicita más información sobre el proyecto del lead',
  body: 'Hola {{1}}, en Bolt estamos preparando opciones para su proyecto. ¿Podría compartirnos un poco más de detalle sobre lo que tiene en mente? Por ejemplo: funcionalidades principales, referencias de diseño que le gusten, o fecha ideal de lanzamiento. Así le preparamos una propuesta a su medida. 🎯',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
  ],
  relevantStatuses: ['active', 'contacted', 'new'],
  autoTrigger: null,
};

const reenganche_una_semana: WhatsAppTemplate = {
  name: 'reenganche_una_semana',
  displayName: 'Re-enganche (1 semana)',
  category: 'marketing',
  description: 'Re-enganche para leads que no responden en una semana',
  body: 'Hola {{1}}, le escribe el equipo de Bolt. Hace una semana platicamos sobre su proyecto y queríamos saber si aún lo tiene en mente. Tenemos disponibilidad este mes para arrancar y podríamos tenerle una propuesta lista en 24 horas. ¿Le interesa? ⚡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
  ],
  relevantStatuses: ['active', 'contacted', 'new'],
  autoTrigger: null,
};

const promocion_especial: WhatsAppTemplate = {
  name: 'promocion_especial',
  displayName: 'Promoción especial',
  category: 'marketing',
  description: 'Envía una promoción o descuento especial',
  body: 'Hola {{1}}, en Bolt tenemos una promoción especial este mes: {{2}}. Si le interesa aprovecharla, responda a este mensaje y le damos todos los detalles. ¡Cupo limitado! 🟡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Descripción de la promoción', example: '20% de descuento en páginas web' },
  ],
  relevantStatuses: ['active', 'contacted', 'new', 'converted'],
  autoTrigger: null,
};

const seguimiento_post_reunion: WhatsAppTemplate = {
  name: 'seguimiento_post_reunion',
  displayName: 'Seguimiento post-reunión',
  category: 'marketing',
  description: 'Se envía después de una reunión para dar seguimiento',
  body: 'Hola {{1}}, fue un gusto platicar con usted. Como comentamos en la reunión, le estaremos enviando la propuesta de su proyecto de {{2}} en las próximas horas. ¿Tiene alguna duda adicional mientras tanto? Estamos a sus órdenes. ✅',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Tipo de proyecto', example: 'tienda en línea' },
  ],
  relevantStatuses: ['scheduled', 'converted'],
  autoTrigger: null,
};

const seguimiento_propuesta_enviada: WhatsAppTemplate = {
  name: 'seguimiento_propuesta_enviada',
  displayName: 'Seguimiento propuesta enviada',
  category: 'marketing',
  description: 'Seguimiento después de enviar una propuesta/cotización',
  body: 'Hola {{1}}, ¿tuvo oportunidad de revisar la propuesta que le enviamos para su proyecto de {{2}}? Si tiene alguna pregunta o quiere ajustar algo, estamos completamente a sus órdenes. 📋',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
    { key: '2', description: 'Tipo de proyecto', example: 'página web' },
  ],
  relevantStatuses: ['converted'],
  autoTrigger: null,
};

const bienvenida_bolt: WhatsAppTemplate = {
  name: 'bienvenida_bolt',
  displayName: 'Bienvenida / Saludo general',
  category: 'marketing',
  description: 'Mensaje inicial para abrir conversación con un nuevo lead',
  body: 'Hola {{1}}, gracias por su interés en Bolt. Somos expertos en desarrollo web y creamos soluciones digitales a la medida de su negocio. ¿En qué le podemos ayudar? Responda a este mensaje y con gusto le atendemos. ⚡',
  variables: [
    { key: '1', description: 'Nombre del cliente', example: 'Carlos' },
  ],
  relevantStatuses: ['new'],
  autoTrigger: null,
};

// ============================================================
// Export all templates
// ============================================================

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  // Utility (transactional)
  recordatorio_reunion_2h,
  recordatorio_reunion_24h,
  confirmacion_reunion_agendada,
  asignacion_asesor,
  // Marketing
  seguimiento_sin_respuesta_48h,
  seguimiento_sin_agendar,
  solicitud_detalles_proyecto,
  reenganche_una_semana,
  promocion_especial,
  seguimiento_post_reunion,
  seguimiento_propuesta_enviada,
  bienvenida_bolt,
];

export const UTILITY_TEMPLATES = WHATSAPP_TEMPLATES.filter(t => t.category === 'utility');
export const MARKETING_TEMPLATES = WHATSAPP_TEMPLATES.filter(t => t.category === 'marketing');

/**
 * Get a template by name
 */
export function getTemplate(name: string): WhatsAppTemplate | undefined {
  return WHATSAPP_TEMPLATES.find(t => t.name === name);
}

/**
 * Get templates relevant for a given lead/conversation status
 */
export function getRelevantTemplates(status: string): WhatsAppTemplate[] {
  return WHATSAPP_TEMPLATES.filter(t =>
    !t.relevantStatuses || t.relevantStatuses.includes(status)
  );
}

/**
 * Build the components array for WhatsApp API from template + variable values
 */
export function buildTemplateComponents(
  template: WhatsAppTemplate,
  variableValues: Record<string, string>
): Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }> | undefined {
  if (template.variables.length === 0) return undefined;

  const parameters = template.variables.map(v => ({
    type: 'text' as const,
    text: variableValues[v.key] || v.example,
  }));

  return [{ type: 'body', parameters }];
}

/**
 * Preview a template body with variable values filled in
 */
export function previewTemplateBody(
  template: WhatsAppTemplate,
  variableValues: Record<string, string>
): string {
  let body = template.body;
  for (const v of template.variables) {
    const value = variableValues[v.key] || v.example;
    body = body.replace(`{{${v.key}}}`, value);
  }
  return body;
}
