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

export type Creator = { id: number; public_id?: string | null; name: string; profile_photo_url?: string | null };

export type CreatorProfileData = {
  id: number;
  public_id: string | null;
  name: string;
  profile_photo_url: string | null;
  cover_image_url: string | null;
  bio: string | null;
  category: string | null;
  badges: { slug: string; name: string }[];
  subscriber_count: number;
  video_count: number;
  sparks_count: number;
  is_me: boolean;
  is_subscribed: boolean;
  can_offer_consultations: boolean;
  videos: {
    id: number;
    public_id: string | null;
    title: string;
    thumbnail_url: string | null;
    thumbnail_token: string | null;
    requires_payment: boolean;
    is_unlocked: boolean;
    views: number;
  }[];
  series: { id: number; title: string; is_premium: boolean; media_count: number }[];
};

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

export type ChatUser = { id: number; name: string; profile_photo_url?: string | null };

export type ConversationSummary = {
  id: number;
  other_user: ChatUser | null;
  last_message: { body: string; is_mine: boolean; attachment_type: string | null } | null;
  unread_count: number;
  last_message_at: string | null;
};

export type ChatMessage = {
  id: number;
  body: string;
  is_mine: boolean;
  created_at: string | null;
  attachment_type: string | null;
  attachment_name?: string | null;
  attachment_duration?: number | null;
  // Signed and short-lived; GET /api/v1/messages/{id}/link issues a new one.
  attachment_url?: string | null;
  edited?: boolean;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  reply_to: { id: number; body: string; user_name: string | null } | null;
  user: ChatUser | null;
};

export type ConversationPage = {
  data: { id: number; other_user: ChatUser | null };
  messages: ChatMessage[];
  meta: { current_page: number; last_page: number };
};

export type AppNotification = {
  id: string;
  type: string | null;
  message: string;
  url: string | null;
  image_url: string | null;
  read: boolean;
  created_at: string | null;
};

export type NotificationFeed = {
  data: AppNotification[];
  meta: { current_page: number; last_page: number; unread_count: number };
};

export type SearchCreator = {
  id: number;
  public_id: string | null;
  name: string;
  profile_photo_url: string | null;
  bio_excerpt: string | null;
};

export type SearchVideo = {
  id: number;
  public_id: string | null;
  title: string;
  creator_name: string | null;
  thumbnail_url: string | null;
  requires_payment: boolean;
};

export type SearchResponse = { data: { creators: SearchCreator[]; videos: SearchVideo[] } };

export type IssuedToken = {
  token: string;
  token_type?: string;
  expires_at: string;
};

export type LoginResponse = IssuedToken | { two_factor: true; challenge_id: string };
