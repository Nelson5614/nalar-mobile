// Voice notes and attachments are played and opened on the web for now, so
// the app names them instead of showing an empty bubble.
const ATTACHMENT_LABELS: Record<string, string> = {
  voice: 'Voice message',
  image: 'Photo',
  file: 'File',
};

export function messageText(body: string, attachmentType: string | null): string {
  if (attachmentType && !body) return ATTACHMENT_LABELS[attachmentType] ?? 'Attachment';

  return body;
}
