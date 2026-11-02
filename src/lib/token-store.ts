import * as SecureStore from 'expo-secure-store';

const KEY = 'nalar.session';

export type StoredToken = { token: string; expiresAt: string };

export type TokenStore = {
  get: () => Promise<StoredToken | null>;
  set: (value: StoredToken) => Promise<void>;
  clear: () => Promise<void>;
};

// The keychain is the only place the bearer token lives. Nothing else in the
// app persists it, so signing out here signs out everywhere on the device.
export const tokenStore: TokenStore = {
  async get() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      return raw ? (JSON.parse(raw) as StoredToken) : null;
    } catch {
      return null;
    }
  },
  async set(value) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(value), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY);
  },
};
