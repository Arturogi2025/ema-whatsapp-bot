'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

// VAPID public key — must match server-side
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type PushState = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export default function PushNotificationToggle() {
  const [state, setState] = useState<PushState>('loading');

  useEffect(() => {
    checkSubscription();
  }, []);

  async function checkSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
      setState('unsupported');
      return;
    }

    const permission = Notification.permission;
    if (permission === 'denied') {
      setState('denied');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? 'subscribed' : 'unsubscribed');
    } catch {
      setState('unsupported');
    }
  }

  async function subscribe() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      // Send subscription to server
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (res.ok) {
        setState('subscribed');
      } else {
        console.error('[Push] Failed to save subscription');
      }
    } catch (err) {
      console.error('[Push] Subscribe error:', err);
    }
  }

  async function unsubscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      setState('unsubscribed');
    } catch (err) {
      console.error('[Push] Unsubscribe error:', err);
    }
  }

  if (state === 'loading' || state === 'unsupported') return null;

  const isOn = state === 'subscribed';
  const isDenied = state === 'denied';

  return (
    <button
      onClick={isOn ? unsubscribe : subscribe}
      disabled={isDenied}
      title={
        isDenied
          ? 'Notificaciones bloqueadas — habilítalas en la configuración del navegador'
          : isOn
          ? 'Desactivar notificaciones push'
          : 'Activar notificaciones push'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 8,
        border: `1px solid ${isOn ? '#F5C30040' : 'var(--border)'}`,
        background: isOn ? '#F5C30015' : 'var(--bg-elevated)',
        cursor: isDenied ? 'not-allowed' : 'pointer',
        color: isDenied ? 'var(--text-muted)' : isOn ? '#F5C300' : 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: 500,
        transition: 'all 0.15s',
        opacity: isDenied ? 0.5 : 1,
      }}
    >
      {isDenied ? (
        <BellOff size={14} />
      ) : isOn ? (
        <BellRing size={14} />
      ) : (
        <Bell size={14} />
      )}
      <span style={{ lineHeight: 1 }}>
        {isDenied ? 'Bloqueadas' : isOn ? 'Push activo' : 'Activar push'}
      </span>
    </button>
  );
}
