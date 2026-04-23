import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import { getToken } from "../storage/auth.storage";

// API URL configuration
// iOS Simulator: http://localhost:3000
// Android Emulator: http://10.0.2.2:3000
// Physical Device: http://YOUR_MACHINE_IP:3000
const API_URL = __DEV__ 
  ? "http://localhost:3000"  // Change this for Android: http://10.0.2.2:3000
  : "https://your-production-api.com";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

export const trpcClientOptions = {
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      async headers() {
        const token = await getToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
};
