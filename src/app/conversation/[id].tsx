import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { ChatThread, type ThreadPaths } from '@/components/chat-thread';
import { joinThread, type RealtimeConfig, type ThreadEvents } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import type { ConversationPage } from '@/lib/types';

export { mergeLatest } from '@/components/chat-thread';

const pathsFor = (id: string): ThreadPaths => ({
  page: `/api/v1/conversations/${id}`,
  send: `/api/v1/conversations/${id}/messages`,
  voice: `/api/v1/conversations/${id}/voice-messages`,
  attachment: `/api/v1/conversations/${id}/attachments`,
  message: (messageId) => `/api/v1/messages/${messageId}`,
  reaction: (messageId) => `/api/v1/messages/${messageId}/reaction`,
  link: (messageId) => `/api/v1/messages/${messageId}/link`,
});

const describe = (header: ConversationPage['data']) => ({
  title: header.other_user?.name ?? '',
  photo: header.other_user?.profile_photo_url ?? null,
});

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { launch } = useSession();
  const realtime = launch?.route === 'home' ? (launch.config.realtime as RealtimeConfig | undefined) : undefined;
  const paths = useMemo(() => pathsFor(id), [id]);
  const join = useCallback((events: ThreadEvents) => joinThread(realtime, id, events), [realtime, id]);

  return (
    <ChatThread
      paths={paths}
      join={join}
      describe={describe}
      headerAvatar
      backTitle="Inbox"
      maxLength={5000}
      unsendNote="It will be removed for both of you."
      cachePrefix="dm"
    />
  );
}
