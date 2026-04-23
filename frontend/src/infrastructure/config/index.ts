export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  trpcUrl: import.meta.env.VITE_TRPC_URL || 'http://localhost:3000/trpc',
} as const;
