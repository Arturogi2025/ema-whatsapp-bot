'use client';

import { useEffect, useRef } from 'react';

/**
 * Sentinel element placed at the end of a scrollable message list.
 * Scrolls into view on mount AND whenever the parent re-renders with new
 * content (e.g. after AutoRefresh triggers router.refresh()).
 *
 * We use a monotonically increasing key from the server (messageCount) so
 * the effect re-fires when new messages arrive.
 */
export default function ScrollToBottom({ messageCount }: { messageCount?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Small delay to ensure DOM is ready after server component re-render
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }, 50);
    return () => clearTimeout(t);
  }, [messageCount]);

  return <div ref={ref} />;
}
