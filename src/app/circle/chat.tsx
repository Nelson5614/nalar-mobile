import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { ChatThread, type ThreadPaths } from '@/components/chat-thread';
import { joinCircleThread, type RealtimeConfig, type ThreadEvents } from '@/lib/realtime';
import { useSession } from '@/lib/session';

const pathsFor = (id: string): ThreadPaths => ({
  page: `/api/v1/circles/${id}/thread`,
  send: `/api/v1/circles/${id}/thread/messages`,
  voice: `/api/v1/circles/${id}/thread/voice-messages`,
  attachment: `/api/v1/circles/${id}/thread/attachments`,
  message: (messageId) => `/api/v1/circle-messages/${messageId}`,
  reaction: (messageId) => `/api/v1/circle-messages/${messageId}/reaction`,
  link: (messageId) => `/api/v1/circle-messages/${messageId}/link`,
});

const describe = (header: { title: string }) => ({ title: header.title });

/**
 * The circle's group chat: everything a direct message does, with each sender
 * named. A paused member reads, and the server says why they cannot post.
 */
export default function CircleChat() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { launch } = useSession();
  const signedIn = launch?.route === 'home' ? launch : null;
  const realtime = signedIn?.config.realtime as RealtimeConfig | undefined;
  const myName = signedIn?.me.name ?? '';
  const paths = useMemo(() => pathsFor(id), [id]);
  const join = useCallback(
    (events: ThreadEvents) => joinCircleThread(realtime, id, myName, events),
    [realtime, id, myName],
  );

  return (
    <ChatThread
      paths={paths}
      join={join}
      describe={describe}
      initialTitle={title ?? 'Circle chat'}
      backTitle="Back"
      group
      placeholder="Message the circle"
      maxLength={2000}
      unsendNote="It will be removed for everyone in the circle."
      emptyText="No messages yet. Say hello."
      cachePrefix="circle"
    />
  );
}
