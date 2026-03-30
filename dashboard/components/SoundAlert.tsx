'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface SoundAlertProps {
  /** Current total message count to detect changes */
  messageCount: number;
}

export default function SoundAlert({ messageCount }: SoundAlertProps) {
  const prevCount = useRef(messageCount);
  const [muted, setMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Beep sound using Web Audio API (no external file needed)
  function playBeep() {
    if (muted) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      // Pleasant notification sound — two quick tones
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not available
    }
  }

  useEffect(() => {
    if (messageCount > prevCount.current) {
      playBeep();
    }
    prevCount.current = messageCount;
  }, [messageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read muted preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bolt-sound-muted');
    if (saved === 'true') setMuted(true);
  }, []);

  function toggleMute() {
    const newMuted = !muted;
    setMuted(newMuted);
    localStorage.setItem('bolt-sound-muted', String(newMuted));
  }

  return (
    <button
      onClick={toggleMute}
      title={muted ? 'Activar sonido' : 'Silenciar'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 7,
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        cursor: 'pointer',
        color: muted ? 'var(--text-muted)' : '#22c55e',
        transition: 'all 0.15s',
      }}
    >
      {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
    </button>
  );
}
