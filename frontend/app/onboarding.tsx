import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'

export default function Onboarding() {
    const router = useRouter()
    const colorScheme = useColorScheme()
    const colors = Colors[colorScheme ?? 'light']
    return (
        <SafeAreaView style={[GlobalStyles.container, {backgroundColor: colors.background}]}>

        <ThemedText>This is the onboarding screen</ThemedText>
        <Button action={() => router.push('/(tabs)/dashboard')}>
            <ThemedText>Navigate to dashboard</ThemedText>
        </Button>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    
})