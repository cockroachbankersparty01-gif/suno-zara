import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createApi, fetchServerConfig, normalizeServerUrl, type Api, type Me, type ServerConfig } from './api';

WebBrowser.maybeCompleteAuthSession();

const K = { server: 'sz.serverUrl', devUser: 'sz.devUserId' };

export type SessionStatus = 'loading' | 'needsServer' | 'serverDown' | 'signedOut' | 'needsTos' | 'ready';

interface SessionValue {
  status: SessionStatus;
  serverUrl: string | null;
  config: ServerConfig | null;
  api: Api | null;
  me: Me | null;
  error: string | null;
  setServer(url: string): Promise<void>;
  retry(): Promise<void>;
  /** Go back to the server-address screen (keeps the old address pre-filled). */
  changeServer(): void;
  refreshMe(): Promise<Me | null>;
  signInDev(): Promise<void>;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<'signed_in' | 'check_email'>;
  signInGoogle(): Promise<void>;
  acceptTos(): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
export const useSession = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
};
/** Shortcut for screens that only render once signed in. */
export const useApi = () => {
  const { api } = useSession();
  if (!api) throw new Error('API not ready');
  return api;
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const getToken = useCallback(async () => {
    if (config?.authMode === 'dev') return devToken;
    const sb = supabaseRef.current;
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  }, [config?.authMode, devToken]);

  const api = useMemo(() => (serverUrl ? createApi(serverUrl, getToken) : null), [serverUrl, getToken]);

  /** Loads /me and decides which screen the user belongs on. */
  const loadMe = useCallback(
    async (a: Api | null = api): Promise<Me | null> => {
      if (!a) return null;
      try {
        const m = await a.me();
        setMe(m);
        setStatus(m.tos.accepted ? 'ready' : 'needsTos');
        return m;
      } catch (e: any) {
        if (e?.status === 401) {
          setMe(null);
          setStatus('signedOut');
          return null;
        }
        setError(e?.message ?? String(e));
        // A hiccup while already using the app shouldn't throw the user out to the setup screen.
        setStatus((prev) => (prev === 'ready' ? prev : 'serverDown'));
        return null;
      }
    },
    [api],
  );

  const connect = useCallback(async (url: string) => {
    setStatus('loading');
    setError(null);
    try {
      const cfg = await fetchServerConfig(url);
      setConfig(cfg);
      supabaseRef.current =
        cfg.authMode === 'supabase' && cfg.supabaseUrl && cfg.supabaseAnonKey
          ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
              auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
            })
          : null;
      let signedIn = false;
      if (cfg.authMode === 'dev') {
        const id = await AsyncStorage.getItem(K.devUser);
        setDevToken(id ? `dev:${id}` : null);
        signedIn = !!id;
      } else if (supabaseRef.current) {
        signedIn = !!(await supabaseRef.current.auth.getSession()).data.session;
      }
      setServerUrl(normalizeServerUrl(url));
      if (!signedIn) setStatus('signedOut');
      // When signed in, the effect below loads /me once `api` has the new token getter.
      else setStatus('loading');
    } catch (e: any) {
      setServerUrl(normalizeServerUrl(url));
      setError(e?.message ?? String(e));
      setStatus('serverDown');
    }
  }, []);

  // Boot: read the saved server address.
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(K.server);
      if (saved) await connect(saved);
      else setStatus('needsServer');
    })();
  }, [connect]);

  // Once connected and signed in, fetch the profile.
  useEffect(() => {
    if (status === 'loading' && api && config) void loadMe(api);
  }, [status, api, config, loadMe]);

  // Keep in sync with Supabase session changes (token refresh, sign-out elsewhere).
  useEffect(() => {
    const sb = supabaseRef.current;
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setMe(null);
        setStatus('signedOut');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [config]);

  const value: SessionValue = {
    status, serverUrl, config, api, me, error,

    async setServer(url) {
      const u = normalizeServerUrl(url);
      await fetchServerConfig(u); // throws with a readable message if wrong
      await AsyncStorage.setItem(K.server, u);
      await connect(u);
    },
    async retry() {
      if (serverUrl) await connect(serverUrl);
      else setStatus('needsServer');
    },
    changeServer() {
      setMe(null);
      setStatus('needsServer');
    },
    refreshMe: () => loadMe(),

    async signInDev() {
      let id = await AsyncStorage.getItem(K.devUser);
      if (!id) {
        id = Crypto.randomUUID();
        await AsyncStorage.setItem(K.devUser, id);
      }
      setDevToken(`dev:${id}`);
      setStatus('loading');
    },
    async signInEmail(email, password) {
      const sb = supabaseRef.current;
      if (!sb) throw new Error('Sign-in is not configured on this server.');
      const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      setStatus('loading');
    },
    async signUpEmail(email, password) {
      const sb = supabaseRef.current;
      if (!sb) throw new Error('Sign-up is not configured on this server.');
      const { data, error: err } = await sb.auth.signUp({ email: email.trim(), password });
      if (err) throw err;
      if (data.session) {
        setStatus('loading');
        return 'signed_in';
      }
      return 'check_email'; // Supabase "confirm email" is on
    },
    async signInGoogle() {
      const sb = supabaseRef.current;
      if (!sb) throw new Error('Google sign-in is not configured on this server.');
      const redirectTo = Linking.createURL('auth-callback'); // sunozara://auth-callback
      const { data, error: err } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (err || !data.url) throw err ?? new Error('Could not start Google sign-in');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return; // user closed the browser
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const errDesc = url.searchParams.get('error_description');
      if (errDesc) throw new Error(errDesc);
      if (!code) throw new Error('Google sign-in did not return a code');
      const { error: exErr } = await sb.auth.exchangeCodeForSession(code);
      if (exErr) throw exErr;
      setStatus('loading');
    },
    async acceptTos() {
      if (!api || !config) return;
      await api.acceptTos(config.tosVersion);
      await loadMe();
    },
    async signOut() {
      if (config?.authMode === 'dev') {
        // Keep the dev id so the same test account comes back; just drop the token.
        setDevToken(null);
      } else {
        await supabaseRef.current?.auth.signOut();
      }
      setMe(null);
      setStatus('signedOut');
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
