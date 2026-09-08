import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'

export type ProfileAvatarUser = {
  full_name?: string | null
  email?: string | null
  avatar_url?: string | null
}

/** Return the user's initials for the profile-avatar fallback. */
export function getProfileInitials(user?: ProfileAvatarUser | null): string {
  const name = user?.full_name?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }

  return user?.email?.trim().charAt(0).toUpperCase() || '?'
}

/** Ignore placeholder avatars that older accounts may have received. */
export function isUsableProfileAvatar(uri?: string | null): uri is string {
  return Boolean(uri && !/(?:pravatar\.cc|ui-avatars\.com)/i.test(uri))
}

/** Pick an image and copy it out of the temporary picker cache. */
export async function pickProfileImage(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    copyToCacheDirectory: true,
    multiple: false,
  })

  if (result.canceled || !result.assets?.[0]?.uri) return null

  const asset = result.assets[0]
  try {
    const extension = (asset.name?.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
    const destination = new File(Paths.document, `profile-avatar-${Date.now()}.${extension}`)
    if (destination.exists) destination.delete()
    new File(asset.uri).copy(destination)
    return destination.uri
  } catch {
    // Some Android document providers expose a content URI that cannot be
    // copied by the new file-system API. The picker URI is still displayable.
    return asset.uri
  }
}
