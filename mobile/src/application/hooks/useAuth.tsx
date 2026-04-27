import { useState, useEffect, createContext, useContext } from "react";
import { trpc } from "../../infrastructure/api/trpc";
import { authStorage } from "../../infrastructure/storage/auth.storage";

// Structural minimum used by the legacy template screens. Phase 11 will replace
// this with the typed User from @arena/shared once the auth UI is rebuilt.
interface StoredAuthUser {
  id?: string;
  email?: string | null;
  fullName?: string | null;
  roles?: Array<{ id: string; name: string }>;
}

interface AuthContextType {
  user: StoredAuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = trpc.auth.loginWithPassword.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = await authStorage.getToken();
      if (token) {
        // Storage returns unknown; the saved shape always matches StoredAuthUser
        // because it was written by setUser(result.user) on a successful login.
        const savedUser = await authStorage.getUser() as StoredAuthUser | null;
        setUser(savedUser);
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const result = await loginMutation.mutateAsync({ email, password });
    await authStorage.setToken(result.accessToken);
    await authStorage.setRefreshToken(result.refreshToken);
    await authStorage.setUser(result.user);
    setUser(result.user);
  };

  const logout = async () => {
    try {
      const refreshToken = await authStorage.getRefreshToken();
      if (refreshToken) {
        await logoutMutation.mutateAsync({ refreshToken });
      }
    } catch (error) {
      // Continue with local logout even if server fails
    }
    await authStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
