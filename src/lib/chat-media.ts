import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { api } from '@/lib/session';

// The server's own ceiling for a message attachment (StoreAttachmentRequest).
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type Picked = { uri: string; name: string; type: string; size?: number | null };
export type PickResult = { file: Picked } | { error: string } | null;

const TOO_BIG = 'That file is over 20 MB. Please pick a smaller one.';

function fromImage(asset: ImagePicker.ImagePickerAsset): PickResult {
  if (asset.fileSize && asset.fileSize > MAX_ATTACHMENT_BYTES) return { error: TOO_BIG };

  return {
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize,
    },
  };
}

/** Null means the person backed out, which is not an error. */
export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { error: 'Allow camera access in Settings to take a photo.' };

  try {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return result.canceled ? null : fromImage(result.assets[0]);
  } catch {
    return { error: 'The camera isn’t available on this device.' };
  }
}

export async function pickPhoto(): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

  return result.canceled ? null : fromImage(result.assets[0]);
}

export async function pickDocument(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) return { error: TOO_BIG };

  return {
    file: { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream', size: asset.size },
  };
}

export function formWith(field: string, file: Picked, extra: Record<string, string | number | null | undefined> = {}) {
  const form = new FormData();
  // Expo's fetch takes a real Blob, not React Native's { uri, name, type }
  // object ("Unsupported FormDataPart implementation").
  form.append(field, new File(file.uri), file.name);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined) form.append(key, String(value));
  }

  return form;
}

/** Links in a thread expire after 5 minutes; this asks for a fresh one. */
export async function freshLink(messageId: number): Promise<string> {
  return (await api.get<{ data: { url: string } }>(`/api/v1/messages/${messageId}/link`)).data.url;
}
