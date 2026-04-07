'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, CalendarPlus, Phone, User, FileText, Briefcase } from 'lucide-react';

interface ScheduleCallModalProps {
  open: boolean;
  onClose: () => void;
}

const PROJECT_TYPES = [
  { value: '', label: 'Sin especificar' },
  { value: 'web', label: 'Página web' },
  { value: 'ecommerce', label: 'Tienda online' },
  { value: 'landing', label: 'Landing page' },
  { value: 'redesign', label: 'Rediseño' },
  { value: 'custom', label: 'Sistema a medida' },
];

export default function ScheduleCallModal({ open, onClose }: ScheduleCallModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+52');
  const [datetime, setDatetime] = useState('');
  const [projectType, setProjectType] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  function resetForm() {
    setName('');
    setPhone('+52');
    setDatetime('');
    setProjectType('');
    setNotes('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !datetime) {
      setError('Nombre, teléfono y fecha/hora son requeridos');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          preferred_datetime: datetime,
          project_type: projectType || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al agendar');
        return;
      }

      resetForm();
      onClose();
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(245,195,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CalendarPlus size={16} color="#F5C300" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Agendar llamada
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <div>
              <label style={labelStyle}>
                <User size={12} /> Nombre *
              </label>
              <input
                type="text"
                placeholder="Ej: Juan Pérez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </div>

            {/* Phone */}
            <div>
              <label style={labelStyle}>
                <Phone size={12} /> Teléfono *
              </label>
              <input
                type="tel"
                placeholder="+52 55 1234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Date/Time */}
            <div>
              <label style={labelStyle}>
                <CalendarPlus size={12} /> Fecha y hora *
              </label>
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                style={{
                  ...inputStyle,
                  colorScheme: 'dark',
                }}
              />
            </div>

            {/* Project Type */}
            <div>
              <label style={labelStyle}>
                <Briefcase size={12} /> Tipo de proyecto
              </label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  colorScheme: 'dark',
                }}
              >
                {PROJECT_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>
                <FileText size={12} /> Notas
              </label>
              <textarea
                placeholder="Contexto adicional, referencia, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
                color: '#ef4444',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 20,
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: saving ? 'rgba(245,195,0,0.5)' : '#F5C300',
                color: '#0a0a0a',
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {saving ? 'Agendando...' : 'Agendar llamada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
