import { DarkTheme, ThemeProvider as NavThemeProvider, DefaultTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import 'react-native-reanimated';
import { ThemeProvider, useColorScheme } from "@/hooks/theme-context"
import { ModeProvider } from "@/hooks/mode-context"
import { InterviewerProvider } from "@/hooks/interviewer-context"
import { AuthProvider, useAuth } from "@/hooks/auth-context"

function RootLayoutInner() {
  const colorScheme = useColorScheme()
  const { isSignedIn, isLoading, user } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (isLoading) return

    // Auth screens and the two setup screens manage their own navigation.
    // Do not redirect them while the user is completing setup.
    if (
      segments[0] === '(authScreens)' ||
      segments[0] === 'mode-select' ||
      segments[0] === 'select-interviewer' ||
      segments[0] === 'settings'
    ) return

    if (!isSignedIn) {
      router.replace('/(authScreens)/signin')
    } else if (!user?.profile_completed) {
      router.replace('/mode-select')
    } else if (segments[0] !== '(tabs)') {
      // If logged in and profile complete, redirect to dashboard
      router.replace('/(tabs)/dashboard')
    }
  }, [isSignedIn, isLoading, router, user?.profile_completed, segments])

  if (isLoading) {
    return null
  }

  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(authScreens)" />
        <Stack.Screen name="mode-select" />
        <Stack.Screen name="select-interviewer" />
        <Stack.Screen name="(tabs)" />
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
        <AuthProvider>
          <ModeProvider>
            <InterviewerProvider>
              <RootLayoutInner />
            </InterviewerProvider>
          </ModeProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
