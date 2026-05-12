import { StyleSheet, Text, View } from 'react-native'
import React from 'react'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { GlobalStyles } from '@/components/styles/globalStyles'

export default function Results() {
  const colorScheme = useColorScheme()
  
  return (
    <ThemedView style={[GlobalStyles.container]}>
      <ThemedText>This is the results screen</ThemedText>
    </ThemedView>
  )
}

const styles = StyleSheet.create({})