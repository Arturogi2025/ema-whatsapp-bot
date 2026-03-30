'use client';

import { useState } from 'react';
import { Zap, ChevronDown, ChevronUp } from 'lucide-react';

const QUICK_REPLIES = [
  {
    label: 'Saludo inicial',
    text: '¡Hola! 👋 Gracias por tu interés en Bolt. ¿En qué tipo de proyecto te podemos ayudar?',
  },
  {
    label: 'Pedir más detalles',
    text: 'Me encanta tu idea. ¿Podrías compartirme más detalles sobre lo que necesitas? Por ejemplo: tipo de sitio, funcionalidades clave, y si tienes alguna referencia visual.',
  },
  {
    label: 'Agendar llamada',
    text: '¡Perfecto! Para darte una cotización precisa, me gustaría agendar una llamada rápida de 15 min. ¿Qué día y hora te funcionan mejor esta semana?',
  },
  {
    label: 'Enviar cotización',
    text: 'Ya tengo toda la info. Estoy preparando tu cotización y te la envío en las próximas horas. ¿A qué correo te la mando?',
  },
  {
    label: 'Seguimiento',
    text: '¡Hola de nuevo! 😊 Solo quería dar seguimiento a nuestra conversación. ¿Tuviste oportunidad de revisar la propuesta?',
  },
  {
    label: 'Confirmar cita',
    text: '✅ Confirmado. Nos hablamos el día acordado. Te enviaré un recordatorio antes de la llamada. ¡Gracias!',
  },
  {
    label: 'Agradecer',
    text: '¡Muchas gracias por confiar en Bolt! 🙏 Estamos emocionados de trabajar en tu proyecto. Cualquier duda, aquí estamos.',
  },
  {
    label: 'Fuera de horario',
    text: 'Gracias por tu mensaje. En este momento estamos fuera de horario, pero te responderemos a primera hora mañana. ¡Que tengas excelente noche!',
  },
];

interface QuickRepliesProps {
  onSelect: (text: string) => void;
}

export default function QuickReplies({ onSelect }: QuickRepliesProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px',
          background: 'transparent',
          border: 'none',
          color: '#F5C300',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <Zap size={11} />
        Respuestas rápidas
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {expanded && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '8px 4px',
            maxHeight: 120,
            overflowY: 'auto',
          }}
        >
          {QUICK_REPLIES.map((qr) => (
            <button
              key={qr.label}
              onClick={() => {
                onSelect(qr.text);
                setExpanded(false);
              }}
              title={qr.text}
              style={{
                padding: '5px 10px',
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#F5C300';
                (e.currentTarget as HTMLElement).style.color = '#F5C300';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
