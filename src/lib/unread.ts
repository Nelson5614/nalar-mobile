import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/lib/session';

// Without push yet, the badge checks on this interval and whenever the app
// comes back to the front.
const CHECK_MS = 30000;

const listeners = new Set<() => void>();

/** After reading notifications or messages, so the tab badge drops at once. */
export function refreshUnread() {
  listeners.forEach((listener) => listener());
}

const fetchCount = (path: string) => api.get<{ count: number }>(path).then((r) => r.count);

/** Unread notifications plus unread messages, for the Inbox tab badge. */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      Promise.all([fetchCount('/api/v1/notifications/unread-count'), fetchCount('/api/v1/conversations/unread-count')])
        .then(([notifications, messages]) => !cancelled && setCount(notifications + messages))
        // A missed check keeps the last count; the next one corrects it.
        .catch(() => {});

    check();
    listeners.add(check);
    const timer = setInterval(check, CHECK_MS);
    const foreground = AppState.addEventListener('change', (state) => state === 'active' && check());

    return () => {
      cancelled = true;
      listeners.delete(check);
      clearInterval(timer);
      foreground.remove();
    };
  }, []);

  return count;
}
