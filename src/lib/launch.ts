import { ApiError, type Api } from '@/lib/api';
import type { TokenStore } from '@/lib/token-store';
import type { AppConfig, IssuedToken, Me, Platform } from '@/lib/types';
import { isBelowMinimum } from '@/lib/version';

export type LaunchResult =
  | { route: 'offline'; message: string }
  | { route: 'update-required'; config: AppConfig }
  | { route: 'welcome'; config: AppConfig }
  | { route: 'verify-email'; config: AppConfig; me: Me }
  | { route: 'home'; config: AppConfig; me: Me };

type Deps = {
  api: Pick<Api, 'get' | 'post'>;
  tokens: TokenStore;
  appVersion: string;
  platform: Platform;
};

// Tokens live 30 days. Rotating in the last week keeps an active user signed
// in indefinitely without refreshing on every launch.
const REFRESH_WINDOW_MS = 7 * 86400_000;

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

export async function resolveLaunch({ api, tokens, appVersion, platform }: Deps): Promise<LaunchResult> {
  let config: AppConfig;
  try {
    config = (await api.get<{ data: AppConfig }>('/api/v1/app-config')).data;
  } catch (error) {
    return { route: 'offline', message: messageOf(error) };
  }

  if (isBelowMinimum(appVersion, config.minimum_version?.[platform])) {
    return { route: 'update-required', config };
  }

  const stored = await tokens.get();
  if (!stored) return { route: 'welcome', config };

  if (new Date(stored.expiresAt).getTime() - Date.now() < REFRESH_WINDOW_MS) {
    try {
      const fresh = await api.post<IssuedToken>('/api/v1/auth/refresh');
      await tokens.set({ token: fresh.token, expiresAt: fresh.expires_at });
    } catch {
      // The old token is still valid until it expires; try again next launch.
    }
  }

  let me: Me;
  try {
    me = (await api.get<{ data: Me }>('/api/v1/me')).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await tokens.clear();
      return { route: 'welcome', config };
    }
    return { route: 'offline', message: messageOf(error) };
  }

  return me.email_verified ? { route: 'home', config, me } : { route: 'verify-email', config, me };
}
