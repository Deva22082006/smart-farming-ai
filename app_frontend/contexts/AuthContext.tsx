import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** If anonymous sign-in is disabled, this will be true → show login form */
  needsLogin: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signInWithEmail: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
    needsLogin: false,
    error: null,
  });

  useEffect(() => {
    // 1. Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState({ session, loading: false, needsLogin: false, error: null });
        return;
      }
      // 2. Attempt anonymous sign-in
      supabase.auth.signInAnonymously().then(({ data, error }) => {
        if (error) {
          // Anonymous sign-in not enabled → fall back to login form
          setState({
            session: null,
            loading: false,
            needsLogin: true,
            error: null,
          });
        } else {
          setState({
            session: data.session,
            loading: false,
            needsLogin: false,
            error: null,
          });
        }
      });
    });

    // 3. Listen for auth changes (token refresh, sign-out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({ ...prev, session }));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    } else {
      setState({
        session: data.session,
        loading: false,
        needsLogin: false,
        error: null,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{ ...state, signInWithEmail }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
