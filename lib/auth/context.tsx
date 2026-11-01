"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  vehicle_badge: string;
  badge_color: string;
  role: "viewer" | "moderator" | "admin";
  is_shadowbanned: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isSupabaseConfigured: boolean;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  isLoading: true,
  isSupabaseConfigured: false,
  showAuthModal: false,
  setShowAuthModal: () => {},
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const isSupabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Fetch user profile from Supabase
  const fetchProfile = useCallback(
    async (userId: string) => {
      if (!isSupabaseConfigured) return;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (!error && data) {
          setProfile(data as UserProfile);
        }
      } catch {
        // Profile fetch failed — user can still use guest mode
      }
    },
    [isSupabaseConfigured]
  );

  // Initialize auth state
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function init() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // Get initial session
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (mounted && initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          await fetchProfile(initialSession.user.id);
        }

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (!mounted) return;
          setSession(newSession);
          setUser(newSession?.user ?? null);

          if (newSession?.user) {
            await fetchProfile(newSession.user.id);
          } else {
            setProfile(null);
          }
        });

        if (mounted) setIsLoading(false);

        return () => {
          subscription.unsubscribe();
        };
      } catch {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [isSupabaseConfigured, fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured)
        return { error: "Authentication not configured" };
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return { error: error.message };
        setShowAuthModal(false);
        return {};
      } catch {
        return { error: "Sign in failed. Please try again." };
      }
    },
    [isSupabaseConfigured]
  );

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      if (!isSupabaseConfigured)
        return { error: "Authentication not configured" };
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        });
        if (error) return { error: error.message };
        setShowAuthModal(false);
        return {};
      } catch {
        return { error: "Sign up failed. Please try again." };
      }
    },
    [isSupabaseConfigured]
  );

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setSession(null);
    } catch {
      // Sign out failed silently
    }
  }, [isSupabaseConfigured]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isLoading,
        isSupabaseConfigured,
        showAuthModal,
        setShowAuthModal,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
