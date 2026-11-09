import { router, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useLayoutEffect } from 'react';
import { Platform } from 'react-native';
import { BuilderProvider } from '../builder/BuilderProvider';
import { AuthProvider } from '../lib/auth';
import { useAppStoreUpdatePrompt } from '../lib/appStoreUpdate';
import { useAppUpdatePrompt } from '../lib/appUpdate';
import { useAskBeforeClosing } from '../lib/closeAsk';
import { DraftProvider } from '../lib/draftStore';
import { guardSharedRouter, rootMounted, rootUnmounted } from '../lib/routerBinding';
import { keepTheScreenUpright } from '../lib/screenTurning';
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

/** Back on the last screen asks "Close Megy Prints?" first (closeAsk.ts). */
const canGoBack = () => router.canGoBack();
function AskBeforeClosing() {
  useAskBeforeClosing(canGoBack);
  return null;
}

/** A new version on Google Play: asked for, then "ready" (appUpdate.ts). */
function AskAboutPlayUpdates() {
  useAppUpdatePrompt();
  return null;
}

/** A new version on the App Store: "ready", Update in App Store (appStoreUpdate.ts). */
function AskAboutAppStoreUpdates() {
  useAppStoreUpdatePrompt();
  return null;
}

/** The phone's own store. */
const AskAboutUpdates = Platform.OS === 'ios' ? AskAboutAppStoreUpdates : AskAboutPlayUpdates;

export default function RootLayout() {
  // Every screen is upright; only the Preview turns with the phone, while it
  // is on top (src/lib/screenTurning.ts). Upright from the start, too, after
  // a reload that happened on the Preview. A layout effect: it runs before
  // any screen's own effect, so a Preview opened first still turns.
  useLayoutEffect(() => { void keepTheScreenUpright(); }, []);
  return (
    <AuthProvider>
      <DraftProvider>
        <BuilderProvider>
          <StatusBar style="dark" />
          <KeepRouterBound />
          <AskBeforeClosing />
          <AskAboutUpdates />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.accent,
              headerTitleStyle: { color: colors.text, fontWeight: '700' },
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            {/* The title is never shown here (no header), but iPhone's back
                button on the next screen says it: without one it said "index". */}
            <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
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
            <Stack.Screen name="memories" options={{ title: 'My Memories' }} />
            <Stack.Screen name="auth-return" options={{ title: 'Signing in' }} />
            <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
            <Stack.Screen name="delete-account" options={{ title: 'Delete my account' }} />
          </Stack>
        </BuilderProvider>
      </DraftProvider>
    </AuthProvider>
  );
}
