import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { trpc } from "./infrastructure/api/trpc";
import { queryClient, trpcClientOptions } from "./infrastructure/api/client";
import { AuthProvider } from "./application/hooks/useAuth";
import { AppNavigator } from "./presentation/navigation/AppNavigator";
import {
  SpaceGrotesk_700Bold,
  SpaceGrotesk_500Medium,
} from "@expo-google-fonts/space-grotesk";
import {
  Manrope_400Regular,
  Manrope_500Medium,
} from "@expo-google-fonts/manrope";
import { Lexend_400Regular } from "@expo-google-fonts/lexend";
import {
  Tajawal_400Regular,
  Tajawal_700Bold,
} from "@expo-google-fonts/tajawal";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_700Bold,
    SpaceGrotesk_500Medium,
    Manrope_400Regular,
    Manrope_500Medium,
    Lexend_400Regular,
    Tajawal_400Regular,
    Tajawal_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const trpcClient = trpc.createClient(trpcClientOptions);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
