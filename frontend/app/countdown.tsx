import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, Animated, Easing } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

export default function Countdown() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const [count, setCount] = useState(3)
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (count === 0) {
      router.replace({ pathname: '/interview-session', params: { sessionId } })
      return
    }
    scale.setValue(0.6)
    Animated.timing(scale, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count, scale, sessionId])

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <View style={[styles.ringOuter, { borderColor: colors.border }]}>
          <View style={[styles.ringInner, { borderColor: colors.brandSoft }]}>
            <Animated.Text
              style={[
                styles.number,
                { color: colors.oppositeColor, transform: [{ scale }] },
              ]}
            >
              {count === 0 ? 'Go' : count}
            </Animated.Text>
          </View>
        </View>

        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>Get ready...</ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>Your interview is about to start.</ThemedText>
      </View>
    </SafeAreaView>
  )
}

const RING = 260

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  ringOuter: {
    width: RING, height: RING, borderRadius: RING / 2,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },
  ringInner: {
    width: RING - 40, height: RING - 40, borderRadius: (RING - 40) / 2,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  number: { fontSize: 140, fontWeight: '800', lineHeight: 160 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  sub: { fontSize: 14 },
})
