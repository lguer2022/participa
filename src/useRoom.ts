import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAnonymous, errorMessage, listen, rpc, type PublicState } from './api';

/**
 * Estado público de una sala. Se actualiza con los avisos de Realtime y, por las dudas,
 * cada 30 s. Los avisos se agrupan y se reparten en el tiempo (hasta 0,8 s) para que
 * cientos de celulares no consulten la base exactamente al mismo instante.
 */
export function useRoom(pin: string | undefined) {
  const [state, setState] = useState<PublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!pin) return null;
    try {
      const s = await rpc<PublicState>('room_state', { p_pin: pin });
      setState(s);
      setError('');
      return s;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [pin]);

  const scheduleRefresh = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void refresh();
    }, 150 + Math.random() * 650);
  }, [refresh]);

  useEffect(() => {
    if (!pin || !/^\d{6}$/.test(pin)) {
      setError('El código de sala tiene 6 números.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    let unsubscribe = () => {};
    ensureAnonymous()
      .then(async () => {
        const s = await refresh();
        if (s && !cancelled) unsubscribe = listen(s.session_id, scheduleRefresh);
      })
      .catch((e) => {
        setError(errorMessage(e));
        setLoading(false);
      });
    const id = setInterval(() => void refresh(), 30000);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [pin, refresh, scheduleRefresh]);

  return { state, loading, error, refresh };
}
