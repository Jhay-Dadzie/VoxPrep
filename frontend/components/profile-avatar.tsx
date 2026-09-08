import React, { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { isUsableProfileAvatar, getProfileInitials, ProfileAvatarUser } from '@/lib/profile-avatar'

type ProfileAvatarProps = {
  user?: ProfileAvatarUser | null
  size: number
  colors: { brandSoft: string; tint: string; oppositeColor: string }
  onPress?: () => void
}

export function ProfileAvatar({ user, size, colors, onPress }: ProfileAvatarProps) {
  const uri = isUsableProfileAvatar(user?.avatar_url) ? user.avatar_url : null
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => setImageFailed(false), [uri])

  const avatar = (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brandSoft,
        },
      ]}
    >
      {uri && !imageFailed ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { color: colors.tint, fontSize: Math.max(14, size * 0.34) }]}>
          {getProfileInitials(user)}
        </Text>
      )}
    </View>
  )

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Edit profile picture">
      {avatar}
    </Pressable>
  ) : avatar
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontWeight: '800' },
})
