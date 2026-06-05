import { DarkTheme, ThemeProvider as NavThemeProvider, DefaultTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import 'react-native-reanimated';
import { ThemeProvider, useColorScheme } from "@/hooks/theme-context"

function RootLayoutInner() {
  const colorScheme = useColorScheme()
  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(authScreens)" />
        <Stack.Screen name="countdown" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="questions-ready" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="interview-session" options={{ animation: 'fade' }} />
        <Stack.Screen name="settings" />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
