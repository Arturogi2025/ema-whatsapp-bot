'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Lock } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Contraseña incorrecta');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'fixed',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(21,101,216,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '40px 36px',
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: 'linear-gradient(135deg, #1565D8, #1890FF)',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 32px rgba(21, 101, 216, 0.3)',
            }}
          >
            <Zap size={26} color="white" strokeWidth={2.5} fill="white" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            E-MA Dashboard
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Ingresa tu contraseña para continuar
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 8,
              }}
            >
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              >
                <Lock size={15} />
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px 11px 38px',
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
                  borderRadius: 9,
                  color: 'var(--text-primary)',
                  fontSize: 15,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  letterSpacing: '0.1em',
                }}
                onFocus={e => {
                  if (!error) (e.target as HTMLInputElement).style.borderColor = '#1565D8';
                }}
                onBlur={e => {
                  if (!error) (e.target as HTMLInputElement).style.borderColor = 'var(--border)';
                }}
              />
            </div>
            {error && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '12px',
              background: loading || !password
                ? 'var(--bg-elevated)'
                : 'linear-gradient(135deg, #1565D8, #1890FF)',
              border: loading || !password ? '1px solid var(--border)' : 'none',
              borderRadius: 9,
              color: loading || !password ? 'var(--text-muted)' : 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? 'Verificando...' : 'Entrar →'}
          </button>
        </form>

        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          E-MA · WhatsApp Dashboard
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
