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

export type Creator = { id: number; name: string; profile_photo_url?: string | null };

// Only `media` items open in the app so far; the feed also sends series, polls
// and suggestions.
export type FeedItem = {
  id: number;
  type: 'media' | 'series' | 'poll' | 'suggestion';
  title: string | null;
  creator?: Creator | null;
  requires_payment?: boolean;
  thumbnail_url?: string | null;
};

export type FeedPage = { data: FeedItem[]; current_page: number; last_page: number };

export type MediaDetail = {
  id: number;
  title: string;
  description?: string | null;
  creator: Creator;
  requires_payment: boolean;
  is_unlocked: boolean;
  viewer_is_creator: boolean;
  playback_pending: boolean;
  mux_playback_id: string | null;
  required_credits: number | null;
};

export type Spark = {
  id: number;
  caption: string | null;
  mux_playback_id: string | null;
  thumbnail_url: string | null;
  creator?: { id: number; name: string } | null;
};

export type SparksPage = { data: Spark[]; next_cursor: string | null };

export type IssuedToken = {
  token: string;
  token_type?: string;
  expires_at: string;
};

export type LoginResponse = IssuedToken | { two_factor: true; challenge_id: string };
