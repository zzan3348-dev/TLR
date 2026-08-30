import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  completeAuthCallback,
  getSession,
  onAuthStateChange,
  refreshServerProfile,
  type AuthProfile,
} from "../services/authService";

type AuthContextValue = {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const nextSession = await getSession();
    setSession(nextSession);
    const nextProfile = await refreshServerProfile();
    setProfile(nextProfile);
  }, []);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      if (window.location.pathname === "/auth/callback") {
        const callback = await completeAuthCallback();
        if (callback.error) {
          if (mounted) {
            setError(callback.error);
          }
        } else {
          window.history.replaceState({}, "", callback.nextPath);
        }
      }
      if (mounted) {
        await refresh();
        setLoading(false);
      }
    };
    void bootstrap();
    const subscription = onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ session, profile, loading, error, refresh }),
    [error, loading, profile, refresh, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook is exported alongside its provider so consumers cannot accidentally
// bypass the auth context. Fast Refresh still preserves provider state.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
