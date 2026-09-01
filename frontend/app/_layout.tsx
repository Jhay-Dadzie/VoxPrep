import { DarkTheme, ThemeProvider as NavThemeProvider, DefaultTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import 'react-native-reanimated';
import { ThemeProvider, useColorScheme } from "@/hooks/theme-context"
import { ModeProvider } from "@/hooks/mode-context"
import { InterviewerProvider } from "@/hooks/interviewer-context"
import { AuthProvider, useAuth } from "@/hooks/auth-context"
import { userService } from "@/services/user"

function RootLayoutInner() {
  const colorScheme = useColorScheme()
  const { isSignedIn, isInitializing, user, updateUser } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const isCompletingProfile = useRef(false)

  /**
   * Settle the server-side profile flag.
   *
   * Setup used to be two screens standing between signing in and the app, and
   * finishing them was what marked the profile complete. Those choices are now
   * filters on the practice screen, so nothing gates entry any more — but the
   * flag still exists server-side and is one-way, so it is settled once, in the
   * background, the first time a signed-in user reaches the app. Nothing waits
   * on it: a failure here costs a retry on the next launch, not the session.
   */
  useEffect(() => {
    if (isInitializing || !isSignedIn || user?.profile_completed) return
    if (isCompletingProfile.current) return

    isCompletingProfile.current = true
    userService
      .completeProfile()
      .then(updateUser)
      .catch(() => {
        isCompletingProfile.current = false
      })
  }, [isInitializing, isSignedIn, user?.profile_completed, updateUser])

  useEffect(() => {
    if (isInitializing) return

    // Screens that manage their own navigation. The interview flow is in here
    // because it runs outside the tab group: without the exemption the redirect
    // below would pull the user back to the dashboard the moment a session
    // started.
    if (
      segments[0] === '(authScreens)' ||
      segments[0] === 'settings' ||
      segments[0] === 'history' ||
      segments[0] === 'countdown' ||
      segments[0] === 'questions-ready' ||
      segments[0] === 'interview-session' ||
      segments[0] === 'exam-session' ||
      segments[0] === 'exam-results' ||
      segments[0] === 'cv-tailor'
    ) return

    if (!isSignedIn) {
      router.replace('/(authScreens)/signin')
    } else if (segments[0] !== '(tabs)') {
      // Signing in lands straight on the dashboard: what you are preparing for
      // and who questions you are chosen on the practice screen, not on the way
      // in.
      router.replace('/(tabs)/dashboard')
    }
  }, [isSignedIn, isInitializing, router, segments])

  if (isInitializing) {
    return null
  }

  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(authScreens)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="countdown" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="questions-ready" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="interview-session" options={{ animation: 'fade' }} />
        {/* The written-exam flow. Outside the tabs for the same reason the
            interview is: sitting a paper should not offer a tab bar out of it. */}
        <Stack.Screen name="exam-session" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="exam-results" options={{ animation: 'fade' }} />
        <Stack.Screen name="cv-tailor" options={{ animation: 'fade' }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="history" />
        <Stack.Screen name="oauth-callback" options={{ animation: 'none' }} />
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
