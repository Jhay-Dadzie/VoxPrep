import { StyleSheet, Text, View } from 'react-native'
import React from 'react'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'
import { useRouter } from 'expo-router'

export default function Signup() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  
  return (
    <ThemedView style={[GlobalStyles.container]}>
      <ThemedText>This is the signup screen</ThemedText>
      <Button action={() => router.replace('/(tabs)/dashboard')}>
        <ThemedText type='placeholderText'>Signup</ThemedText>
      </Button>
    </ThemedView>
  )
}

const styles = StyleSheet.create({})