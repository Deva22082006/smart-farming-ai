import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY env vars. ' +
      'Create a .env file in the app_frontend/ directory.',
  );
}

/**
 * Custom storage adapter that safely handles SSR (Node.js) environments
 * where `window` / `localStorage` are not available.
 * On native → delegates to AsyncStorage.
 * On web client → delegates to AsyncStorage (which uses localStorage).
 * During SSR → returns no-op stubs so the module can be imported safely.
 */
const isSSR =
  Platform.OS === 'web' && typeof window === 'undefined';

const safeStorage = isSSR
  ? {
      getItem: async (_key: string) => null,
      setItem: async (_key: string, _value: string) => {},
      removeItem: async (_key: string) => {},
    }
  : AsyncStorage;

/**
 * Single shared Supabase client — import this everywhere,
 * never instantiate a second client.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: safeStorage,
      autoRefreshToken: !isSSR,
      persistSession: !isSSR,
      detectSessionInUrl: false,
    },
  },
);
