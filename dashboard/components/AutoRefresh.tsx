'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Auto-refresh component that polls for new data every N seconds.
 * Uses router.refresh() which re-fetches server components without full page reload.
 */
export default function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);

    // Also refresh on focus (when user switches back to tab)
    function onFocus() {
      router.refresh();
    }
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, intervalMs]);

  return null;
}
