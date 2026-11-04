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

export type Creator = {
  id: number;
  public_id?: string | null;
  name: string;
  profile_photo_url?: string | null;
  subscribers_count?: number;
};

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
    required_credits?: number | null;
    views: number;
    created_at?: string | null;
  }[];
  series: {
    id: number;
    title: string;
    is_premium: boolean;
    bundle_price_credits?: number | null;
    media_count: number;
    thumbnail_url?: string | null;
  }[];
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
  views?: number;
  created_at?: string | null;
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
  // Set when the video has no price of its own and is bought with its bundle.
  series_paywall?: { id: number; title: string; bundle_price_credits: number } | null;
  views?: number;
  created_at?: string | null;
  likes_count?: number;
  is_liked?: boolean;
};

export type VideoComment = {
  id: number;
  content: string;
  created_at: string | null;
  user: ChatUser | null;
  likes_count?: number;
  liked_by_me?: boolean;
  is_liked?: boolean;
  replies_count?: number;
  replies?: VideoComment[];
};

export type RelatedVideo = {
  id: number;
  public_id?: string | null;
  title: string;
  views?: number;
  created_at?: string | null;
  thumbnail_url?: string | null;
  requires_payment?: boolean;
  is_unlocked?: boolean;
  required_credits?: number | null;
  creator?: { id: number; name: string; profile_photo_url?: string | null } | null;
};

export type SeriesEpisode = {
  id: number;
  public_id?: string | null;
  title: string;
  thumbnail_url?: string | null;
  views?: number;
  requires_payment: boolean;
  current_user_can_play: boolean;
  playback_pending: boolean;
};

export type SeriesDetail = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_premium: boolean;
  bundle_price_credits: number | null;
  is_unlocked: boolean;
  can_be_unlocked: boolean;
  viewer_is_creator: boolean;
  creator: Creator | null;
  media: SeriesEpisode[];
};

export type Spark = {
  id: number;
  caption: string | null;
  mux_playback_id: string | null;
  thumbnail_url: string | null;
  creator?: { id: number; name: string; profile_photo_url?: string | null } | null;
  view_count?: number;
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
  share_count?: number;
  save_count?: number;
  is_liked?: boolean;
  is_disliked?: boolean;
  is_saved?: boolean;
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

export type LibraryAsset = {
  id: string;
  kind: 'pdf' | 'audio' | string;
  filename: string | null;
  size_bytes: number | null;
  // An in-app reader exists for PDFs only; audio is download-only, as on the web.
  readable: boolean;
  downloadable: boolean;
};

export type LibraryOrder = {
  id: string;
  status: string;
  credits_spent: number;
  created_at: string | null;
  seller: { id: number; name: string } | null;
  product: { id: string; title: string; type: string; cover_image_url: string | null } | null;
  assets: LibraryAsset[];
};

export type CircleSummary = {
  id: number;
  public_id?: string | null;
  title: string;
  description?: string | null;
  cover_image_url?: string | null;
  is_free: boolean;
  monthly_price_credits: number | null;
  member_count?: number;
  creator?: Creator | null;
};

export type CircleMembershipInfo = {
  id: number;
  status: 'active' | 'paused' | 'cancelled' | string;
  renews_at: string | null;
};

export type MyCircle = CircleMembershipInfo & { circle: CircleSummary };

export type CircleDetail = {
  circle: CircleSummary;
  membership: CircleMembershipInfo | null;
  is_member: boolean;
  is_creator: boolean;
};

export type CircleSession = {
  id: number;
  title: string;
  scheduled_for: string;
  duration_minutes: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled' | string;
};
