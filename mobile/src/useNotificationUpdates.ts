import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';

type Preview = { id: string; title: string; message: string };

// In-app updates only: stop polling in the background and reset on account changes.
export function useNotificationUpdates(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const [banner, setBanner] = useState<Preview | null>(null);
  const generation = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const syncCount = useCallback((value: number) => {
    generation.current++;
    setCount(value);
    setBanner(null);
  }, []);
  const dismiss = useCallback(() => setBanner(null), []);
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const seen = new Set<string>();
    generation.current++;
    setCount(0); setBanner(null);
    async function poll() {
      if (!userId || disposed || pending || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      pending = true;
      const ticket = generation.current;
      try {
        const [total, latest] = await Promise.all([
          api<{ count: number }>('/notifications/unread-count'),
          api<Preview[]>('/notifications?limit=1&unread=true'),
        ]);
        if (disposed || ticket !== generation.current) return;
        setCount(total.count);
        if (!total.count) setBanner(null);
        else if (latest[0] && !seen.has(latest[0].id)) {
          seen.add(latest[0].id);
          setBanner(latest[0]);
        }
      } catch {
        // Retain the last count through transient network errors; inbox has retry UI.
      } finally { pending = false; }
    }
    refreshRef.current = poll;
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void poll(); });
    return () => { disposed = true; generation.current++; clearInterval(timer); sub.remove(); };
  }, [userId]);

  return { count, banner, dismiss, syncCount, refresh };
}
