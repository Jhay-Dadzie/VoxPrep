import { DarkTheme, ThemeProvider, DefaultTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import 'react-native-reanimated';
import { useColorScheme } from "@/hooks/use-color-scheme"

export default function RootLayout() {
  const colorScheme = useColorScheme()
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{headerShown: false}}>
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="auto"/>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
