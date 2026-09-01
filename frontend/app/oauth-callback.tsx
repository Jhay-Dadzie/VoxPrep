import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useColorScheme } from '@/hooks/theme-context'

/**
 * Landing pad for the `frontend://oauth-callback` deep link.
 *
 * The Google sign-in flow normally resolves inside `openAuthSessionAsync` and
 * never navigates here, but the OS can still deliver the redirect to the app as
 * an ordinary deep link - and without a matching route that shows the router's
 * "Unmatched Route" screen right after a successful sign-in. The root layout's
 * redirect sends the user on to the dashboard or sign-in, so this only has to
 * exist and not flash anything jarring while it does.
 */
export default function OAuthCallback() {
  const colorScheme = useColorScheme()

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
      <ActivityIndicator size="large" color={colorScheme === 'dark' ? '#fff' : '#000'} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
