import Echo from 'laravel-echo';
import Pusher from 'pusher-js/react-native';

import { api } from '@/lib/session';

export type RealtimeConfig = {
  key: string | null;
  host: string | null;
  port: number;
  scheme: string | null;
  auth_endpoint: string;
};

export type ThreadEvents = {
  // Something in the thread changed: a new, edited or reacted-to message.
  onChange: () => void;
  onDeleted: (messageId: number) => void;
  // A circle names who is typing; a direct message has only one other person.
  onTyping: (name?: string) => void;
};

export type ThreadChannel = { typing: () => void; leave: () => void };

let echo: Echo<'reverb'> | null = null;

function connect(config: RealtimeConfig): Echo<'reverb'> {
  if (echo) return echo;

  echo = new Echo({
    broadcaster: 'reverb',
    key: config.key!,
    wsHost: config.host!,
    wsPort: config.port,
    wssPort: config.port,
    forceTLS: config.scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    Pusher,
    // The app has a bearer token, not a session, so channel auth goes
    // through the API's own /api/broadcasting/auth.
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: (error: Error | null, data: any) => void) => {
        api
          .post('/api/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
          .then((data) => callback(null, data))
          .catch((error) => callback(error, null));
      },
    }),
  });

  return echo;
}

/**
 * Joins a circle's presence channel. A group has many people typing, so each
 * whisper carries the typist's name. Returns null when the server publishes
 * no realtime key, and the screen keeps polling instead.
 */
export function joinCircleThread(
  config: RealtimeConfig | undefined,
  circleId: string,
  myName: string,
  events: ThreadEvents,
): ThreadChannel | null {
  if (!config?.key || !config.host) return null;

  const name = `circle.${circleId}`;
  const channel = connect(config)
    .join(name)
    .listen('.circle.message.sent', events.onChange)
    .listen('.circle.message.changed', (e: { id: number; deleted: boolean }) =>
      e.deleted ? events.onDeleted(e.id) : events.onChange(),
    )
    .listenForWhisper('typing', (e: { name?: string }) => events.onTyping(e?.name));

  return {
    typing: () => channel.whisper('typing', { name: myName }),
    leave: () => echo?.leave(name),
  };
}

/**
 * Joins a thread's private channel. Returns null when the server publishes no
 * realtime key, and the screen keeps polling instead.
 */
export function joinThread(
  config: RealtimeConfig | undefined,
  conversationId: string,
  events: ThreadEvents,
): ThreadChannel | null {
  if (!config?.key || !config.host) return null;

  const name = `conversation.${conversationId}`;
  const channel = connect(config)
    .private(name)
    .listen('.message.sent', events.onChange)
    .listen('.message.updated', events.onChange)
    .listen('.message.reactions', events.onChange)
    .listen('.message.deleted', (e: { id: number }) => events.onDeleted(e.id))
    .listenForWhisper('typing', () => events.onTyping());

  return {
    typing: () => channel.whisper('typing', {}),
    leave: () => echo?.leave(name),
  };
}
