'use client';

import { useEffect, useRef } from 'react';

export default function ScrollToBottom() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  return <div ref={ref} />;
}
