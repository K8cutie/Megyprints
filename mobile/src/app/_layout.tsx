import { router, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useLayoutEffect } from 'react';
import { BuilderProvider } from '../builder/BuilderProvider';
import { AuthProvider } from '../lib/auth';
import { DraftProvider } from '../lib/draftStore';
import { guardSharedRouter, rootMounted, rootUnmounted } from '../lib/routerBinding';
import { colors } from '../lib/theme';

/** Keeps the shared router bound after Android rebuilds the screen (routerBinding.ts). */
function KeepRouterBound() {
  const live = useRouter();
  useLayoutEffect(() => {
    guardSharedRouter(router);
    rootMounted(live);
    return () => rootUnmounted(live);
  }, [live]);
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DraftProvider>
        <BuilderProvider>
          <StatusBar style="dark" />
          <KeepRouterBound />
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
            <Stack.Screen name="album-name" options={{ title: 'Name your album' }} />
            <Stack.Screen name="album-size" options={{ title: 'Album size' }} />
            <Stack.Screen name="photos" options={{ title: 'Your photos' }} />
            <Stack.Screen name="pick-photos" options={{ title: 'Pick photos' }} />
            <Stack.Screen name="album-cover" options={{ title: 'Your cover' }} />
            <Stack.Screen name="making" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="preview" options={{ title: 'Your album' }} />
            <Stack.Screen name="edit-pages" options={{ title: 'Edit pages' }} />
            <Stack.Screen name="golden-pages" options={{ title: 'Golden pages' }} />
            <Stack.Screen name="photo-check-lab" options={{ title: 'Photo check test' }} />
            <Stack.Screen name="order" options={{ title: 'Your order' }} />
            <Stack.Screen name="orders" options={{ title: 'Your orders' }} />
            <Stack.Screen name="order-details" options={{ title: 'Order' }} />
            <Stack.Screen name="profile" options={{ title: 'My Profile' }} />
            <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
            <Stack.Screen name="delete-account" options={{ title: 'Delete my account' }} />
          </Stack>
        </BuilderProvider>
      </DraftProvider>
    </AuthProvider>
  );
}
