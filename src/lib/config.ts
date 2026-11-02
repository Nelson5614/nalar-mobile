import Constants from 'expo-constants';
import { Platform as RNPlatform } from 'react-native';

import type { Platform } from '@/lib/types';

// The iOS Simulator shares the Mac's network, so Herd's nalar.test works there.
// A physical phone needs the Mac's LAN address in EXPO_PUBLIC_API_URL instead.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://nalar.test').replace(/\/$/, '');

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export const PLATFORM: Platform = RNPlatform.OS === 'android' ? 'android' : 'ios';
