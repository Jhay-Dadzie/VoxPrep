import React, { memo, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

/**
 * The moving waveform shown while someone is speaking.
 *
 * Two things it has to get right. The bars must track the actual microphone
 * level, so the user can see they are being heard — a decorative animation that
 * moves whether or not the mic is working is worse than nothing, because it
 * lies at exactly the moment the user needs the truth. And it has to look
 * continuous, when the volume samples underneath arrive only about ten times a
 * second: each bar animates towards its new height rather than jumping, which
 * turns a 10Hz signal into something that reads as smooth.
 *
 * When nothing is being heard it settles into a slow idle pulse, so a silent
 * room looks like listening rather than a frozen screen.
 */

const BAR_COUNT = 28
const MIN_HEIGHT = 4
const MAX_HEIGHT = 52
/** Roughly the sample interval, so a bar arrives at its height as the next one lands. */
const SETTLE_MS = 110

type Props = {
  /**
   * Newest first is not assumed: index 0 is the oldest sample on the left.
   * Values are 0–1, where 0 is silence.
   */
  levels: number[]
  color: string
  /** Idle pulse instead of level tracking — used when the mic is not live. */
  idle?: boolean
}

function Bar({ level, color, idle, index }: { level: number; color: string; idle: boolean; index: number }) {
  const height = useSharedValue(MIN_HEIGHT)

  useEffect(() => {
    if (idle) {
      // A gentle breathing motion, offset per bar so the row ripples rather
      // than blinking in unison.
      height.value = withRepeat(
        withSequence(
          withTiming(MIN_HEIGHT + 5, { duration: 700 + index * 40 }),
          withTiming(MIN_HEIGHT, { duration: 700 + index * 40 })
        ),
        -1,
        true
      )
      return
    }

    height.value = withTiming(MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT), {
      duration: SETTLE_MS,
    })
  }, [height, idle, index, level])

  const style = useAnimatedStyle(() => ({ height: height.value }))

  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />
}

function VoiceWaveComponent({ levels, color, idle = false }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: BAR_COUNT }).map((_, index) => (
        <Bar
          key={index}
          index={index}
          idle={idle}
          color={color}
          level={levels[index] ?? 0}
        />
      ))}
    </View>
  )
}

export const VoiceWave = memo(VoiceWaveComponent)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: MAX_HEIGHT + 8,
  },
  bar: { width: 3, borderRadius: 2 },
})
