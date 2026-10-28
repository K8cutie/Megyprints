import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { DraftProvider } from '../lib/draftStore';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <DraftProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="albums" options={{ title: 'My albums' }} />
          <Stack.Screen name="shared-check" options={{ title: 'Shared code check' }} />
          <Stack.Screen name="photos" options={{ title: 'Your photos' }} />
          <Stack.Screen name="pick-photos" options={{ title: 'Pick photos' }} />
          <Stack.Screen name="album-next" options={{ title: 'Your album' }} />
          <Stack.Screen name="photo-check-lab" options={{ title: 'Photo check test' }} />
        </Stack>
      </DraftProvider>
    </AuthProvider>
  );
}
