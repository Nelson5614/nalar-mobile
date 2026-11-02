export type Platform = 'ios' | 'android';

export type AppConfig = {
  features: Record<string, boolean>;
  guest_browsing: { enabled: boolean; free_plays_before_signup: number };
  top_up: { url: string; link_enabled: Record<Platform, boolean> };
  minimum_version: Record<Platform, string>;
  [key: string]: unknown;
};

export type Me = {
  id: number;
  name: string;
  email?: string;
  email_verified: boolean;
  credit_balance: number;
  [key: string]: unknown;
};

export type IssuedToken = {
  token: string;
  token_type?: string;
  expires_at: string;
};

export type LoginResponse = IssuedToken | { two_factor: true; challenge_id: string };
