import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { createApi } from '@/lib/api';
import { API_URL, APP_VERSION, PLATFORM } from '@/lib/config';
import { resolveLaunch, type LaunchResult } from '@/lib/launch';
import { tokenStore } from '@/lib/token-store';
import type { IssuedToken } from '@/lib/types';

export const api = createApi({
  baseUrl: API_URL,
  getToken: async () => (await tokenStore.get())?.token ?? null,
  onUnauthorized: () => tokenStore.clear(),
});

const launchNow = () => resolveLaunch({ api, tokens: tokenStore, appVersion: APP_VERSION, platform: PLATFORM });

type Session = {
  launch: LaunchResult | null;
  reload: () => Promise<LaunchResult>;
  signIn: (issued: IssuedToken) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [launch, setLaunch] = useState<LaunchResult | null>(null);

  const reload = useCallback(async () => {
    const next = await launchNow();
    setLaunch(next);

    return next;
  }, []);

  const signIn = useCallback(
    async (issued: IssuedToken) => {
      await tokenStore.set({ token: issued.token, expiresAt: issued.expires_at });
      await reload();
    },
    [reload],
  );

  const signOut = useCallback(async () => {
    // Revoking on the server is best effort; the device forgets the token either way.
    await api.post('/api/v1/auth/logout').catch(() => {});
    await tokenStore.clear();
    await reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    launchNow().then((next) => {
      if (!cancelled) setLaunch(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ launch, reload, signIn, signOut }), [launch, reload, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');

  return session;
}
