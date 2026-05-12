import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'

export default function Onboarding() {
    const router = useRouter()
    const colorScheme = useColorScheme()

    return (
        <SafeAreaView style={[GlobalStyles.container, {backgroundColor: Colors[colorScheme ?? 'light'].background}]}>

        <ThemedText>This is the onboarding screen</ThemedText>
        <TouchableOpacity onPress={() => router.push('/(tabs)/dashboard')} style={styles.button}>
            <ThemedText>Navigate to Dashboard</ThemedText>
        </TouchableOpacity>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    button: {
        paddingVertical: 15,
        backgroundColor: '#004AC6',
        alignItems: 'center',
        margin: 20,
        borderRadius: 70
    }
})