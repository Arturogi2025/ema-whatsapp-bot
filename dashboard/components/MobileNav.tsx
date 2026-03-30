'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Bell, BellRing, BellOff } from 'lucide-react';

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

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/conversations', label: 'Chats', icon: MessageSquare },
  { href: '/leads', label: 'Leads', icon: Users },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [pushState, setPushState] = useState<PushState>('loading');

  useEffect(() => {
    checkPushSubscription();
  }, []);

  async function checkPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
      setPushState('unsupported');
      return;
    }
    const permission = Notification.permission;
    if (permission === 'denied') {
      setPushState('denied');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushState(subscription ? 'subscribed' : 'unsubscribed');
    } catch {
      setPushState('unsupported');
    }
  }

  async function togglePush() {
    if (pushState === 'subscribed') {
      // Unsubscribe
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
        setPushState('unsubscribed');
      } catch (err) {
        console.error('[Push] Unsubscribe error:', err);
      }
    } else {
      // Subscribe
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setPushState('denied');
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        if (res.ok) {
          setPushState('subscribed');
        }
      } catch (err) {
        console.error('[Push] Subscribe error:', err);
      }
    }
  }

  const pushHidden = pushState === 'loading' || pushState === 'unsupported';
  const pushOn = pushState === 'subscribed';
  const pushDenied = pushState === 'denied';

  function getPushIcon() {
    if (pushDenied) return BellOff;
    if (pushOn) return BellRing;
    return Bell;
  }

  function getPushLabel() {
    if (pushDenied) return 'Bloqueado';
    if (pushOn) return 'Push ✓';
    return 'Push';
  }

  const PushIcon = getPushIcon();

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        display: 'none', // shown via CSS media query
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        zIndex: 50,
        justifyContent: 'space-around',
        padding: '6px 0 env(safe-area-inset-bottom, 6px)',
      }}
    >
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 16px',
              textDecoration: 'none',
              color: active ? '#F5C300' : 'var(--text-muted)',
              fontSize: 10,
              fontWeight: active ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            {label}
          </Link>
        );
      })}

      {/* Push notification toggle button */}
      {!pushHidden && (
        <button
          onClick={togglePush}
          disabled={pushDenied}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '6px 16px',
            background: 'none',
            border: 'none',
            color: pushOn ? '#F5C300' : pushDenied ? 'var(--text-muted)' : 'var(--text-muted)',
            fontSize: 10,
            fontWeight: pushOn ? 600 : 400,
            cursor: pushDenied ? 'not-allowed' : 'pointer',
            transition: 'color 0.15s',
            opacity: pushDenied ? 0.5 : 1,
          }}
        >
          <PushIcon size={20} strokeWidth={pushOn ? 2.5 : 2} />
          {getPushLabel()}
        </button>
      )}
    </nav>
  );
}
