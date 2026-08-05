import { useColorScheme } from "@/hooks/use-color-scheme";
import { GlobalStyles } from "@/components/styles/globalStyles";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";

export default function AuthLayout() {
    const colorScheme = useColorScheme()
    const colors = Colors[colorScheme ?? 'light']
    return (
        <SafeAreaView style={[{backgroundColor: colors.background, flex: 1}]}>
            <Stack screenOptions={{headerShown: false}} />
        </SafeAreaView>
    )
}