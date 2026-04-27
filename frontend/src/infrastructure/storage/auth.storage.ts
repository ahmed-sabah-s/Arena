export const authStorage = {
  getAccessToken: (): string | null => {
    return localStorage.getItem('accessToken');
  },

  setAccessToken: (token: string): void => {
    localStorage.setItem('accessToken', token);
  },

  getRefreshToken: (): string | null => {
    return localStorage.getItem('refreshToken');
  },

  setRefreshToken: (token: string): void => {
    localStorage.setItem('refreshToken', token);
  },

  clearTokens: (): void => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  // Stored user is whatever shape the auth response returned. Callers narrow if they
  // need specific fields; storage doesn't enforce a schema (Phase 9 will).
  getUser: (): unknown => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  setUser: (user: unknown): void => {
    localStorage.setItem('user', JSON.stringify(user));
  },

  clearUser: (): void => {
    localStorage.removeItem('user');
  },

  clear: (): void => {
    authStorage.clearTokens();
    authStorage.clearUser();
  },
};
