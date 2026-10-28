/* Going to the Preview from a step: back to the Preview already in the stack
   when there is one (the customer came back from it to change something), or
   a new one. Two Previews in the stack made Android's back button walk
   through the same book twice. */
import { router, useNavigation } from 'expo-router';
import { useCallback } from 'react';

export function useGoToPreview(): (how?: 'push' | 'replace') => void {
  const navigation = useNavigation();
  return useCallback((how: 'push' | 'replace' = 'push') => {
    const routes = navigation.getState()?.routes ?? [];
    const here = routes[routes.length - 1];
    if (routes.some((r) => r.name === 'preview' && r !== here)) router.dismissTo('/preview');
    else if (how === 'replace') router.replace('/preview');
    else router.push('/preview');
  }, [navigation]);
}
