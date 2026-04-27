import { useNavigate } from 'react-router-dom';
import { trpc } from '@/infrastructure/api/trpc';
import { authStorage } from '@/infrastructure/storage/auth.storage';
import { useCallback } from 'react';

export const useAuth = () => {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: (data) => {
      authStorage.setAccessToken(data.accessToken);
      authStorage.setRefreshToken(data.refreshToken);
      authStorage.setUser(data.user);
      utils.user.getMe.invalidate();
      navigate('/dashboard');
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      authStorage.clear();
      navigate('/login');
    },
  });

  const { data: user, isLoading } = trpc.user.getMe.useQuery(undefined, {
    enabled: !!authStorage.getAccessToken(),
    retry: false,
  });

  const login = useCallback(
    (email: string, password: string, twoFactorCode?: string) => {
      return loginMutation.mutateAsync({ email, password, twoFactorCode });
    },
    [loginMutation]
  );

  // Email/password registration was removed in Phase 2 — phone+OTP is the primary path.
  // Phase 9 (admin dashboard) and Phase 11 (mobile) will build the new auth UI.
  // Until then, this stub keeps the legacy template's RegisterPage compiling.
  const register = useCallback(
    async (_email: string, _password: string, _name: string) => {
      throw new Error('Email/password registration is no longer supported. Use phone+OTP via the Arena mobile app.');
    },
    []
  );

  const logout = useCallback(() => {
    const refreshToken = authStorage.getRefreshToken();
    if (refreshToken) {
      logoutMutation.mutate({ refreshToken });
    } else {
      authStorage.clear();
      navigate('/login');
    }
  }, [logoutMutation, navigate]);

  const hasPermission = useCallback(
    (resource: string, action: string): boolean => {
      if (!user) return false;

      return user.roles.some((role) =>
        role.permissions.some(
          (permission) =>
            permission.resource === resource && permission.action === action
        )
      );
    },
    [user]
  );

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    hasPermission,
    loginError: loginMutation.error,
    registerError: null as Error | null,
    isLoginLoading: loginMutation.isPending,
    isRegisterLoading: false,
  };
};
