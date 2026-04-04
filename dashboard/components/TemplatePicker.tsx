'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Send, ChevronDown, ChevronUp, Clock, Megaphone,
  X, Eye, AlertCircle, Check,
} from 'lucide-react';

// Template definitions (client-side mirror of lib/templates.ts)
interface TemplateVariable {
  key: string;
  description: string;
  example: string;
}

interface TemplateInfo {
  name: string;
  displayName: string;
  category: 'utility' | 'marketing';
  description: string;
  body: string;
  variables: TemplateVariable[];
  relevantStatuses?: string[];
}

const TEMPLATES: TemplateInfo[] = [
  // UTILITY
  {
    name: 'recordatorio_reunion_2h',
    displayName: 'Recordatorio (2 horas)',
    category: 'utility',
    description: 'Recordatorio 2 horas antes de la reunión',
    body: 'Hola {{1}}, le recordamos que su reunión con el equipo de Bolt está programada para hoy a las {{2}}. ¿Nos confirma su asistencia? Estamos listos para atenderle. 🟡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Hora', example: '3:00 PM' },
    ],
    relevantStatuses: ['scheduled'],
  },
  {
    name: 'recordatorio_reunion_24h',
    displayName: 'Recordatorio (24 horas)',
    category: 'utility',
    description: 'Recordatorio 24 horas antes de la reunión',
    body: 'Hola {{1}}, le recordamos que mañana tiene una reunión agendada con Bolt a las {{2}}. Si necesita reagendar, responda a este mensaje y con gusto le buscamos otro horario. ⚡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Hora', example: '3:00 PM' },
    ],
    relevantStatuses: ['scheduled'],
  },
  {
    name: 'confirmacion_reunion_agendada',
    displayName: 'Confirmación de reunión',
    category: 'utility',
    description: 'Confirma reunión agendada con detalle del asesor',
    body: 'Hola {{1}}, su reunión con Bolt ha sido confirmada para el {{2}} a las {{3}}. Le contactará {{4}}, su asesor personalizado. Si tiene alguna duda antes de la reunión, puede escribirnos aquí. ✅',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Fecha', example: 'jueves 10 de abril' },
      { key: '3', description: 'Hora', example: '3:00 PM' },
      { key: '4', description: 'Asesor', example: 'Diego' },
    ],
    relevantStatuses: ['scheduled'],
  },
  {
    name: 'asignacion_asesor',
    displayName: 'Asignación de asesor',
    category: 'utility',
    description: 'Notifica que un asesor dará seguimiento',
    body: 'Hola {{1}}, le informamos que {{2}} de nuestro equipo le dará seguimiento personalizado a su proyecto de {{3}}. En breve se pondrá en contacto con usted por este mismo medio. ⚡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Asesor', example: 'Diego' },
      { key: '3', description: 'Proyecto', example: 'página web' },
    ],
    relevantStatuses: ['new', 'contacted', 'scheduled'],
  },
  // MARKETING
  {
    name: 'seguimiento_sin_respuesta_48h',
    displayName: 'Seguimiento (48h sin respuesta)',
    category: 'marketing',
    description: 'Lead no responde en 48 horas',
    body: 'Hola {{1}}, soy del equipo de Bolt. Le escribimos hace un par de días sobre su proyecto. ¿Sigue interesado en recibir una cotización sin compromiso? Estamos para servirle. ⚡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
    ],
    relevantStatuses: ['active', 'new', 'contacted'],
  },
  {
    name: 'seguimiento_sin_agendar',
    displayName: 'Seguimiento (sin agendar)',
    category: 'marketing',
    description: 'Lead con interés pero sin llamada agendada',
    body: 'Hola {{1}}, en Bolt notamos que mostró interés en su proyecto de {{2}}. ¿Le gustaría agendar una breve llamada de 15 minutos para platicar los detalles? Puede elegir el horario que más le convenga. 📅',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Proyecto', example: 'tienda en línea' },
    ],
    relevantStatuses: ['active', 'contacted'],
  },
  {
    name: 'solicitud_detalles_proyecto',
    displayName: 'Solicitar detalles',
    category: 'marketing',
    description: 'Pide más info sobre el proyecto',
    body: 'Hola {{1}}, en Bolt estamos preparando opciones para su proyecto. ¿Podría compartirnos un poco más de detalle sobre lo que tiene en mente? Por ejemplo: funcionalidades principales, referencias de diseño que le gusten, o fecha ideal de lanzamiento. Así le preparamos una propuesta a su medida. 🎯',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
    ],
    relevantStatuses: ['active', 'contacted', 'new'],
  },
  {
    name: 'reenganche_una_semana',
    displayName: 'Re-enganche (1 semana)',
    category: 'marketing',
    description: 'Lead sin respuesta en una semana',
    body: 'Hola {{1}}, le escribe el equipo de Bolt. Hace una semana platicamos sobre su proyecto y queríamos saber si aún lo tiene en mente. Tenemos disponibilidad este mes para arrancar y podríamos tenerle una propuesta lista en 24 horas. ¿Le interesa? ⚡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
    ],
    relevantStatuses: ['active', 'contacted', 'new'],
  },
  {
    name: 'promocion_especial',
    displayName: 'Promoción especial',
    category: 'marketing',
    description: 'Envía descuento o promo especial',
    body: 'Hola {{1}}, en Bolt tenemos una promoción especial este mes: {{2}}. Si le interesa aprovecharla, responda a este mensaje y le damos todos los detalles. ¡Cupo limitado! 🟡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Promoción', example: '20% de descuento en páginas web' },
    ],
    relevantStatuses: ['active', 'contacted', 'new', 'converted'],
  },
  {
    name: 'seguimiento_post_reunion',
    displayName: 'Post-reunión',
    category: 'marketing',
    description: 'Seguimiento después de una reunión',
    body: 'Hola {{1}}, fue un gusto platicar con usted. Como comentamos en la reunión, le estaremos enviando la propuesta de su proyecto de {{2}} en las próximas horas. ¿Tiene alguna duda adicional mientras tanto? Estamos a sus órdenes. ✅',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Proyecto', example: 'tienda en línea' },
    ],
    relevantStatuses: ['scheduled', 'converted'],
  },
  {
    name: 'seguimiento_propuesta_enviada',
    displayName: 'Seguimiento propuesta',
    category: 'marketing',
    description: 'Después de enviar cotización/propuesta',
    body: 'Hola {{1}}, ¿tuvo oportunidad de revisar la propuesta que le enviamos para su proyecto de {{2}}? Si tiene alguna pregunta o quiere ajustar algo, estamos completamente a sus órdenes. 📋',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
      { key: '2', description: 'Proyecto', example: 'página web' },
    ],
    relevantStatuses: ['converted'],
  },
  {
    name: 'bienvenida_bolt',
    displayName: 'Bienvenida',
    category: 'marketing',
    description: 'Saludo inicial para abrir conversación',
    body: 'Hola {{1}}, gracias por su interés en Bolt. Somos expertos en desarrollo web y creamos soluciones digitales a la medida de su negocio. ¿En qué le podemos ayudar? Responda a este mensaje y con gusto le atendemos. ⚡',
    variables: [
      { key: '1', description: 'Nombre', example: 'Carlos' },
    ],
    relevantStatuses: ['new'],
  },
];

const PROJECT_TYPE_LABELS: Record<string, string> = {
  web: 'página web',
  ecommerce: 'tienda en línea',
  landing: 'landing page',
  custom: 'sistema a medida',
};

interface TemplatePickerProps {
  conversationId: string;
  leadName?: string | null;
  leadStatus?: string;
  conversationStatus?: string;
  projectType?: string | null;
  preferredDatetime?: string | null;
}

export default function TemplatePicker({
  conversationId,
  leadName,
  leadStatus,
  conversationStatus,
  projectType,
  preferredDatetime,
}: TemplatePickerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Auto-fill variables based on lead data
  function autoFillVariables(template: TemplateInfo): Record<string, string> {
    const values: Record<string, string> = {};
    for (const v of template.variables) {
      const desc = v.description.toLowerCase();
      if (desc.includes('nombre')) {
        values[v.key] = leadName || '';
      } else if (desc.includes('proyecto')) {
        values[v.key] = projectType ? (PROJECT_TYPE_LABELS[projectType] || projectType) : '';
      } else if (desc.includes('asesor')) {
        values[v.key] = process.env.NEXT_PUBLIC_ADVISOR_NAME || 'Diego';
      } else if (desc.includes('hora') && preferredDatetime) {
        // Try to extract time from preferred datetime
        const timeMatch = preferredDatetime.match(/(\d{1,2}:\d{2}\s*(AM|PM|am|pm)?)/);
        values[v.key] = timeMatch ? timeMatch[1] : '';
      } else if (desc.includes('fecha') && preferredDatetime) {
        // Try to extract date part
        const dateMatch = preferredDatetime.match(/(\d{1,2}\s+de\s+\w+)/);
        values[v.key] = dateMatch ? dateMatch[1] : preferredDatetime;
      } else {
        values[v.key] = '';
      }
    }
    return values;
  }

  function handleSelectTemplate(template: TemplateInfo) {
    setSelectedTemplate(template);
    setVariableValues(autoFillVariables(template));
    setSendError('');
    setSendSuccess(false);
    setShowPreview(false);
  }

  function getPreviewText(): string {
    if (!selectedTemplate) return '';
    let body = selectedTemplate.body;
    for (const v of selectedTemplate.variables) {
      const value = variableValues[v.key] || `[${v.description}]`;
      body = body.replace(`{{${v.key}}}`, value);
    }
    return body;
  }

  function allVariablesFilled(): boolean {
    if (!selectedTemplate) return false;
    return selectedTemplate.variables.every(v => variableValues[v.key]?.trim());
  }

  async function handleSend() {
    if (!selectedTemplate || !allVariablesFilled()) return;
    setSending(true);
    setSendError('');
    setSendSuccess(false);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/send-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          variables: variableValues,
          previewText: getPreviewText(),
        }),
      });

      if (res.ok) {
        setSendSuccess(true);
        setTimeout(() => {
          setSelectedTemplate(null);
          setIsOpen(false);
          setSendSuccess(false);
          router.refresh();
        }, 1500);
      } else {
        const data = await res.json();
        setSendError(data.error || 'Error al enviar plantilla');
      }
    } catch {
      setSendError('Error de conexión');
    } finally {
      setSending(false);
    }
  }

  // Filter templates by relevance
  const status = leadStatus || conversationStatus || 'active';
  const relevantTemplates = TEMPLATES.filter(t =>
    !t.relevantStatuses || t.relevantStatuses.includes(status)
  );
  const otherTemplates = TEMPLATES.filter(t =>
    t.relevantStatuses && !t.relevantStatuses.includes(status)
  );

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Toggle button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setSelectedTemplate(null); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: '1px solid var(--border)',
          background: isOpen ? 'rgba(245,195,0,0.08)' : 'var(--bg-elevated)',
          color: isOpen ? '#F5C300' : 'var(--text-secondary)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <FileText size={13} />
        Plantillas WhatsApp
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {isOpen && (
        <div style={{
          marginTop: 8, padding: 12,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          {/* Template not selected — show list */}
          {!selectedTemplate && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Plantillas recomendadas
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                {relevantTemplates.map(t => (
                  <button
                    key={t.name}
                    onClick={() => handleSelectTemplate(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8,
                      border: '1px solid transparent',
                      background: 'transparent', cursor: 'pointer',
                      textAlign: 'left', transition: 'all 0.1s', width: '100%',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: t.category === 'utility' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {t.category === 'utility' ? (
                        <Clock size={13} color="#22c55e" />
                      ) : (
                        <Megaphone size={13} color="#a855f7" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t.displayName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                      padding: '2px 6px', borderRadius: 4,
                      background: t.category === 'utility' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                      color: t.category === 'utility' ? '#22c55e' : '#a855f7',
                    }}>
                      {t.category === 'utility' ? 'Utilidad' : 'Marketing'}
                    </span>
                  </button>
                ))}

                {otherTemplates.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 4px' }}>
                      Otras plantillas
                    </div>
                    {otherTemplates.map(t => (
                      <button
                        key={t.name}
                        onClick={() => handleSelectTemplate(t)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 8,
                          border: '1px solid transparent',
                          background: 'transparent', cursor: 'pointer',
                          textAlign: 'left', transition: 'all 0.1s', width: '100%',
                          opacity: 0.6,
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
                          (e.currentTarget as HTMLElement).style.opacity = '1';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                          (e.currentTarget as HTMLElement).style.opacity = '0.6';
                        }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                          background: t.category === 'utility' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {t.category === 'utility' ? (
                            <Clock size={13} color="#22c55e" />
                          ) : (
                            <Megaphone size={13} color="#a855f7" />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.displayName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}

          {/* Template selected — show variables + preview */}
          {selectedTemplate && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: selectedTemplate.category === 'utility' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selectedTemplate.category === 'utility' ? (
                      <Clock size={13} color="#22c55e" />
                    ) : (
                      <Megaphone size={13} color="#a855f7" />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {selectedTemplate.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {selectedTemplate.description}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >
                  <X size={16} color="var(--text-muted)" />
                </button>
              </div>

              {/* Variable inputs */}
              {selectedTemplate.variables.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {selectedTemplate.variables.map(v => (
                    <div key={v.key}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                        {v.description} {'{{'}{v.key}{'}}'}
                      </label>
                      <input
                        value={variableValues[v.key] || ''}
                        onChange={e => setVariableValues({ ...variableValues, [v.key]: e.target.value })}
                        placeholder={v.example}
                        style={{
                          width: '100%', padding: '7px 10px',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border)', borderRadius: 7,
                          color: 'var(--text-primary)', fontSize: 13,
                          outline: 'none', fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Preview toggle */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: showPreview ? 'rgba(245,195,0,0.06)' : 'transparent',
                  color: 'var(--text-secondary)', fontSize: 11,
                  cursor: 'pointer', marginBottom: 10,
                }}
              >
                <Eye size={12} />
                {showPreview ? 'Ocultar vista previa' : 'Ver vista previa'}
              </button>

              {showPreview && (
                <div style={{
                  padding: 12, marginBottom: 10,
                  background: '#F5C300', borderRadius: 10,
                  fontSize: 13, lineHeight: 1.6,
                  color: '#0a0a0a', whiteSpace: 'pre-wrap',
                }}>
                  {getPreviewText()}
                </div>
              )}

              {/* Warning for missing variables */}
              {!allVariablesFilled() && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', marginBottom: 8,
                  background: 'rgba(245,158,11,0.08)', borderRadius: 7,
                  border: '1px solid rgba(245,158,11,0.2)',
                }}>
                  <AlertCircle size={13} color="#f59e0b" />
                  <span style={{ fontSize: 11, color: '#f59e0b' }}>
                    Complete todas las variables antes de enviar
                  </span>
                </div>
              )}

              {/* Error */}
              {sendError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', marginBottom: 8,
                  background: 'rgba(239,68,68,0.08)', borderRadius: 7,
                  border: '1px solid rgba(239,68,68,0.2)',
                }}>
                  <AlertCircle size={13} color="#ef4444" />
                  <span style={{ fontSize: 11, color: '#ef4444' }}>{sendError}</span>
                </div>
              )}

              {/* Success */}
              {sendSuccess && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', marginBottom: 8,
                  background: 'rgba(34,197,94,0.08)', borderRadius: 7,
                  border: '1px solid rgba(34,197,94,0.2)',
                }}>
                  <Check size={13} color="#22c55e" />
                  <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                    Plantilla enviada correctamente
                  </span>
                </div>
              )}

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={sending || !allVariablesFilled() || sendSuccess}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '10px 16px', borderRadius: 8,
                  border: 'none',
                  background: !allVariablesFilled() || sending || sendSuccess ? 'var(--bg-surface)' : '#F5C300',
                  color: !allVariablesFilled() || sending || sendSuccess ? 'var(--text-muted)' : '#0a0a0a',
                  fontSize: 13, fontWeight: 700, cursor: !allVariablesFilled() || sending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: allVariablesFilled() && !sending && !sendSuccess ? '0 4px 16px rgba(245,195,0,0.3)' : 'none',
                }}
              >
                {sending ? (
                  <>
                    <div style={{
                      width: 14, height: 14, border: '2px solid var(--text-muted)',
                      borderTopColor: 'transparent', borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }} />
                    Enviando...
                  </>
                ) : sendSuccess ? (
                  <>
                    <Check size={14} /> Enviado
                  </>
                ) : (
                  <>
                    <Send size={14} /> Enviar plantilla
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
